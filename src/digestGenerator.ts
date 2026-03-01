import { App } from 'obsidian';
import { LLMService, DigestArticle } from './llm';
import { NoteWriter, SourceType } from './noteWriter';
import { ReadItAllSettings } from './settings';

export class DigestGenerator {
	private app: App;
	private settings: ReadItAllSettings;
	private llm: LLMService;
	private noteWriter: NoteWriter;

	constructor(app: App, settings: ReadItAllSettings, llm: LLMService, noteWriter: NoteWriter) {
		this.app = app;
		this.settings = settings;
		this.llm = llm;
		this.noteWriter = noteWriter;
	}

	async generate(): Promise<void> {
		// Get start of this week (Monday)
		const now = new Date();
		const weekStart = this.getWeekStart(now);
		const weekLabel = this.getWeekLabel(now);

		// Collect articles from this week across all sources
		const sources: SourceType[] = ['RSS', 'Clipping', 'Substack'];
		const allArticles: DigestArticle[] = [];
		const counts = { rss: 0, clippings: 0, substack: 0 };

		const sectionsBySource: Record<string, string[]> = {
			RSS: [],
			Clipping: [],
			Substack: [],
		};

		for (const source of sources) {
			const articles = await this.noteWriter.getArticlesSince(weekStart, source);

			for (const article of articles) {
				const digestArticle: DigestArticle = {
					title: article.title,
					url: article.url,
					source: article.source,
					bullets: [], // would need to read file content; keep lightweight for now
				};
				allArticles.push(digestArticle);

				// Build per-source summary line
				sectionsBySource[source].push(
					`- **[${article.title}](${article.url})**`
				);
			}

			if (source === 'RSS') counts.rss = articles.length;
			if (source === 'Clipping') counts.clippings = articles.length;
			if (source === 'Substack') counts.substack = articles.length;
		}

		// Generate LLM recommendations
		let recommendations = '_No API key configured — add one in settings to get recommendations._';
		if (this.settings.apiKey && allArticles.length > 0) {
			try {
				recommendations = await this.llm.generateDigest(allArticles, this.settings.interestProfile);
			} catch (err) {
				console.error('Read It All: Digest LLM call failed:', err);
				recommendations = '_Could not generate recommendations — check your API key._';
			}
		}

		const rssSummary = sectionsBySource['RSS'].join('\n') || '_Nothing captured this week._';
		const clippingSummary = sectionsBySource['Clipping'].join('\n') || '_Nothing captured this week._';
		const substackSummary = sectionsBySource['Substack'].join('\n') || '_Nothing captured this week._';

		await this.noteWriter.saveWeeklyDigest(
			weekLabel,
			rssSummary,
			clippingSummary,
			substackSummary,
			recommendations,
			counts
		);
	}

	shouldGenerateToday(): boolean {
		const now = new Date();
		if (now.getDay() !== this.settings.digestDayOfWeek) return false;
		if (now.getHours() < this.settings.digestHour) return false;

		if (!this.settings.lastDigestGenerated) return true;

		const last = new Date(this.settings.lastDigestGenerated);
		const daysSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
		return daysSince >= 6; // don't regenerate within same week
	}

	private getWeekStart(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay(); // 0=Sun
		const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
		d.setDate(diff);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	private getWeekLabel(date: Date): string {
		const year = date.getFullYear();
		const week = this.getWeekNumber(date);
		return `Week-${year}-W${String(week).padStart(2, '0')}`;
	}

	private getWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	}
}
