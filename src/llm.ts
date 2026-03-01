import { requestUrl } from 'obsidian';
import { ReadItAllSettings } from './settings';

export interface ArticleSummary {
	bullets: string[];
	keyQuotes: string[];
}

export class LLMService {
	private settings: ReadItAllSettings;

	constructor(settings: ReadItAllSettings) {
		this.settings = settings;
	}

	private getEndpoint(): string {
		if (this.settings.llmProvider === 'openrouter') {
			return 'https://openrouter.ai/api/v1/chat/completions';
		}
		return 'https://api.openai.com/v1/chat/completions';
	}

	private getHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.settings.apiKey}`,
		};
		if (this.settings.llmProvider === 'openrouter') {
			headers['HTTP-Referer'] = 'obsidian-read-it-all';
			headers['X-Title'] = 'Read It All';
		}
		return headers;
	}

	async complete(systemPrompt: string, userPrompt: string): Promise<string> {
		const response = await requestUrl({
			url: this.getEndpoint(),
			method: 'POST',
			headers: this.getHeaders(),
			body: JSON.stringify({
				model: this.settings.model,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				temperature: 0.3,
				max_tokens: 1000,
			})
		});

		if (response.status !== 200) {
			throw new Error(`LLM API error: ${response.status} — ${response.text}`);
		}

		const data = response.json;
		return data.choices[0].message.content.trim();
	}

	async summarizeArticle(title: string, content: string): Promise<ArticleSummary> {
		const systemPrompt = `You are a reading assistant. Extract key ideas and notable quotes from articles.
You must respond with ONLY a JSON object — no explanation, no markdown, no code fences, no preamble.
The JSON must match this exact shape:
{"bullets":["point 1","point 2","point 3"],"keyQuotes":["quote 1","quote 2"]}
Rules:
- bullets: 3 concise points, 1-2 sentences each
- keyQuotes: 2-4 verbatim quotes from the text, or empty array [] if none
- Output nothing except the JSON object`;

		const userPrompt = `Title: ${title}

Article:
${content.slice(0, 6000)}`;

		const raw = await this.complete(systemPrompt, userPrompt);
		console.log(`Read It All: LLM raw response for "${title}":`, raw.slice(0, 200));

		return this.parseJSON(raw, title);
	}

	private parseJSON(raw: string, title: string): ArticleSummary {
		const fallback: ArticleSummary = {
			bullets: ['Summary unavailable — open article for full content.'],
			keyQuotes: [],
		};

		if (!raw) return fallback;

		// Strategy 1: direct parse
		try {
			return JSON.parse(raw) as ArticleSummary;
		} catch {}

		// Strategy 2: strip markdown fences and retry
		try {
			const stripped = raw
				.replace(/^```json\s*/i, '')
				.replace(/^```\s*/i, '')
				.replace(/\s*```$/i, '')
				.trim();
			return JSON.parse(stripped) as ArticleSummary;
		} catch {}

		// Strategy 3: extract first {...} block from anywhere in the response
		try {
			const match = raw.match(/\{[\s\S]*\}/);
			if (match) {
				return JSON.parse(match[0]) as ArticleSummary;
			}
		} catch {}

		// Strategy 4: manually extract bullets and quotes arrays
		try {
			const bulletsMatch = raw.match(/"bullets"\s*:\s*\[([\s\S]*?)\]/);
			const quotesMatch = raw.match(/"keyQuotes"\s*:\s*\[([\s\S]*?)\]/);

			if (bulletsMatch) {
				const bullets = JSON.parse(`[${bulletsMatch[1]}]`) as string[];
				const keyQuotes = quotesMatch
					? JSON.parse(`[${quotesMatch[1]}]`) as string[]
					: [];
				return { bullets, keyQuotes };
			}
		} catch {}

		console.warn(`Read It All: Could not parse LLM response for "${title}". Raw:`, raw);
		return fallback;
	}

	async generateDigest(
		articles: DigestArticle[],
		interestProfile: string
	): Promise<string> {
		const systemPrompt = `You are a helpful reading assistant generating a weekly digest. 
Given a list of articles captured this week, pick the 3-5 most worth reading based on the user's interest profile.
For each recommendation, give a one-sentence reason why.
Format your response as a markdown list like:
- **[Article Title]** — reason why it's worth reading
Only recommend articles from the provided list.`;

		const articleList = articles
			.map((a, i) => `${i + 1}. "${a.title}" (${a.source}) — ${a.bullets[0] ?? ''}`)
			.join('\n');

		const userPrompt = `User interest profile: ${interestProfile || 'General curiosity across technology, ideas, and culture.'}

Articles this week:
${articleList}`;

		return this.complete(systemPrompt, userPrompt);
	}
}

export interface DigestArticle {
	title: string;
	url: string;
	source: string;
	bullets: string[];
}
