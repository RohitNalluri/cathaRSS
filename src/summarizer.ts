import { App, TFile, normalizePath } from 'obsidian';
import { LLMService } from './llm';
import { ReadItAllSettings } from './settings';

export class Summarizer {
	private app: App;
	private settings: ReadItAllSettings;
	private llm: LLMService;
	private isRunning = false;

	constructor(app: App, settings: ReadItAllSettings, llm: LLMService) {
		this.app = app;
		this.settings = settings;
		this.llm = llm;
	}

	// Find all notes in inbox that have 'unread' but not 'summarized'
	private getUnsummarizedFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter(f => {
			if (!f.path.startsWith(this.settings.inboxPath)) return false;
			const cache = this.app.metadataCache.getFileCache(f);
			const tags: string[] = [];
			const raw = cache?.frontmatter?.tags ?? [];
			const rawList = Array.isArray(raw) ? raw : [raw];
			rawList.forEach((t: string) => tags.push(t));
			const hasUnread = tags.includes('unread');
			const hasSummarized = tags.includes('summarized');
			return hasUnread && !hasSummarized;
		});
	}

	async runQueue(): Promise<void> {
		if (this.isRunning) {
			console.log('Read It All: Summarizer already running, skipping.');
			return;
		}

		if (!this.settings.apiKey) {
			console.log('Read It All: No API key set, skipping summarization.');
			return;
		}

		const files = this.getUnsummarizedFiles();

		if (files.length === 0) {
			console.log('Read It All: No articles to summarize.');
			return;
		}

		this.isRunning = true;
		console.log(`Read It All: Starting summarization queue — ${files.length} articles.`);

		let succeeded = 0;
		let failed = 0;

		for (const file of files) {
			try {
				await this.summarizeFile(file);
				succeeded++;
				// Polite delay between API calls — avoids rate limiting
				await new Promise(resolve => setTimeout(resolve, 1500));
			} catch (err) {
				console.error(`Read It All: Failed to summarize "${file.basename}":`, err);
				failed++;
			}
		}

		this.isRunning = false;
		console.log(`Read It All: Summarization complete — ${succeeded} done, ${failed} failed.`);
	}

	private async summarizeFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);

		// Extract article text from below "## Full Article"
		const fullArticleMatch = content.match(/## Full Article\n+([\s\S]+)$/);
		const articleText = fullArticleMatch?.[1]?.trim() ?? '';

		if (!articleText || articleText.length < 100) {
			console.log(`Read It All: Skipping "${file.basename}" — content too short.`);
			await this.markSummarized(file, content, null);
			return;
		}

		// Get title from filename (strip date prefix)
		const title = file.basename.replace(/^\d{4}-\d{2}-\d{2} - /, '');

		const summary = await this.llm.summarizeArticle(title, articleText);

		// Build updated sections
		const bulletsSection = summary.bullets.length
			? summary.bullets.map(b => `- ${b}`).join('\n')
			: '- No summary generated.';

		const quotesSection = summary.keyQuotes.length
			? summary.keyQuotes.map(q => `> "${q}"`).join('\n\n')
			: '_No key quotes extracted._';

		// Replace the placeholder summary and quotes sections
		let updated = content
			.replace(
				/## Summary\n[\s\S]*?(?=\n## |$)/,
				`## Summary\n${bulletsSection}\n`
			)
			.replace(
				/## Key Quotes\n[\s\S]*?(?=\n## |$)/,
				`## Key Quotes\n${quotesSection}\n`
			);

		// Add 'summarized' tag to frontmatter
		updated = this.markSummarizedInContent(updated);

		await this.app.vault.modify(file, updated);
		console.log(`Read It All: Summarized "${file.basename}"`);
	}

	private markSummarizedInContent(content: string): string {
		// Add 'summarized' tag after the last tag in frontmatter
		return content.replace(
			/(tags:\n(?:  - \S+\n)*)(---|\n##)/,
			(match, tagsBlock, after) => {
				if (tagsBlock.includes('summarized')) return match;
				return `${tagsBlock}  - summarized\n${after}`;
			}
		);
	}

	private async markSummarized(file: TFile, content: string, _summary: null): Promise<void> {
		const updated = this.markSummarizedInContent(content);
		await this.app.vault.modify(file, updated);
	}

	get running(): boolean {
		return this.isRunning;
	}
}
