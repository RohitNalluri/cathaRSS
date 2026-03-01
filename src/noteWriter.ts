import { App, TFile, normalizePath } from 'obsidian';
import { ArticleSummary } from './llm';
import { ReadItAllSettings } from './settings';

export type SourceType = 'RSS' | 'Clipping' | 'Substack';

export interface CapturedArticle {
	title: string;
	url: string;
	author?: string;
	content: string;
	source: SourceType;
	summary?: ArticleSummary;
	capturedAt?: Date;
}

export class NoteWriter {
	private app: App;
	private settings: ReadItAllSettings;

	constructor(app: App, settings: ReadItAllSettings) {
		this.app = app;
		this.settings = settings;
	}

	async saveArticle(article: CapturedArticle): Promise<TFile> {
		const date = article.capturedAt ?? new Date();
		const dateStr = this.formatDate(date);
		const safeTitle = this.sanitizeFilename(article.title);
		const folderPath = normalizePath(`${this.settings.inboxPath}/${article.source}`);
		const filePath = normalizePath(`${folderPath}/${dateStr} - ${safeTitle}.md`);

		// Ensure full folder hierarchy exists
		await this.ensureFolderRecursive(folderPath);

		// Check if already saved (dedup by URL)
		const existing = await this.findByUrl(article.url, folderPath);
		if (existing) {
			console.log(`Read It All: Skipping duplicate: ${article.title}`);
			return existing;
		}

		// Build and save note
		const content = this.buildNoteContent(article, dateStr);
		console.log(`Read It All: Saving note to ${filePath}`);
		return await this.app.vault.create(filePath, content);
	}

	private buildNoteContent(article: CapturedArticle, dateStr: string): string {
		const { summary } = article;

		const bulletsSection = summary?.bullets.length
			? summary.bullets.map(b => `- ${b}`).join('\n')
			: '- No summary generated.';

		const quotesSection = summary?.keyQuotes.length
			? summary.keyQuotes.map(q => `> "${q}"`).join('\n\n')
			: '_No key quotes extracted._';

		return `---
source: ${article.source}
url: ${article.url}
author: ${article.author ?? ''}
date_captured: ${dateStr}
tags:
  - inbox
  - unread
  - ${article.source.toLowerCase()}
---

## Summary
${bulletsSection}

## Key Quotes
${quotesSection}

## Full Article

${article.content}
`;
	}

	async saveWeeklyDigest(
		weekLabel: string,
		rssSummary: string,
		clippingSummary: string,
		substackSummary: string,
		recommendations: string,
		totalCounts: { rss: number; clippings: number; substack: number }
	): Promise<TFile> {
		const folderPath = normalizePath(this.settings.digestPath);
		await this.ensureFolderRecursive(folderPath);

		const filePath = normalizePath(`${folderPath}/${weekLabel}.md`);
		const today = this.formatDate(new Date());

		const content = `---
type: weekly-digest
week: ${weekLabel}
generated: ${today}
tags:
  - digest
  - weekly
---

# Weekly Reading Digest — ${weekLabel}
_Generated on ${today}_

---

## ✅ Recommended Reads This Week
${recommendations}

---

## 🗞 RSS (${totalCounts.rss} articles)
${rssSummary}

## 📎 Clippings (${totalCounts.clippings} articles)
${clippingSummary}

## 📬 Substack (${totalCounts.substack} articles)
${substackSummary}
`;

		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			return existing;
		}

		return await this.app.vault.create(filePath, content);
	}

	private async findByUrl(url: string, folderPath: string): Promise<TFile | null> {
		const files = this.app.vault.getMarkdownFiles().filter(f =>
			f.path.startsWith(folderPath)
		);

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.url === url) {
				return file;
			}
		}
		return null;
	}

	async getArticlesSince(since: Date, source?: SourceType): Promise<CapturedArticle[]> {
		const basePath = source
			? normalizePath(`${this.settings.inboxPath}/${source}`)
			: normalizePath(this.settings.inboxPath);

		const files = this.app.vault.getMarkdownFiles().filter(f =>
			f.path.startsWith(basePath) && f.stat.ctime > since.getTime()
		);

		const articles: CapturedArticle[] = [];
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (fm) {
				articles.push({
					title: file.basename,
					url: fm.url ?? '',
					author: fm.author,
					source: fm.source as SourceType,
					content: '',
					summary: undefined,
				});
			}
		}
		return articles;
	}

	// Creates every segment of a path, e.g. Resources -> Resources/Inbox -> Resources/Inbox/RSS
	private async ensureFolderRecursive(path: string): Promise<void> {
		const parts = normalizePath(path).split('/');
		let current = '';
		for (const part of parts) {
			if (!part) continue;
			current = current ? `${current}/${part}` : part;
			const exists = this.app.vault.getAbstractFileByPath(current);
			if (!exists) {
				try {
					await this.app.vault.createFolder(current);
					console.log(`Read It All: Created folder ${current}`);
				} catch (e) {
					// Already exists from parallel call — safe to ignore
				}
			}
		}
	}

	private formatDate(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	private sanitizeFilename(name: string): string {
		return name
			.replace(/[\\/:*?"<>|]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 80);
	}
}
