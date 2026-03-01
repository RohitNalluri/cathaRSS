import { Notice, requestUrl } from 'obsidian';
import { ReadItAllSettings } from './settings';
import { LLMService } from './llm';
import { NoteWriter } from './noteWriter';

interface RSSItem {
	title: string;
	link: string;
	content: string;
	contentSnippet: string;
	author?: string;
	pubDate?: string;
}

interface ParsedFeed {
	title: string;
	items: RSSItem[];
}

export class RSSFetcher {
	private settings: ReadItAllSettings;
	private llm: LLMService;
	private noteWriter: NoteWriter;

	constructor(settings: ReadItAllSettings, llm: LLMService, noteWriter: NoteWriter) {
		this.settings = settings;
		this.llm = llm;
		this.noteWriter = noteWriter;
	}

	async fetchAll(): Promise<void> {
		const enabledFeeds = this.settings.rssFeeds.filter(f => f.enabled);

		if (enabledFeeds.length === 0) {
			new Notice('Read It All: No RSS feeds configured. Add feeds in Settings.');
			return;
		}

		console.log(`Read It All: Fetching ${enabledFeeds.length} feeds...`);
		let totalSaved = 0;
		let totalSkipped = 0;

		for (const feed of enabledFeeds) {
			try {
				console.log(`Read It All: Fetching ${feed.name} (${feed.url})`);
				const parsed = await this.parseFeed(feed.url);
				const newItems = this.filterNewItems(parsed.items);
				console.log(`Read It All: ${feed.name} — ${parsed.items.length} total, ${newItems.length} new`);

				for (const item of newItems) {
					try {
						const content = item.content || item.contentSnippet || '';

						// Save first WITHOUT summary so articles always land in vault
						await this.noteWriter.saveArticle({
							title: item.title,
							url: item.link,
							author: item.author,
							content,
							source: 'RSS',
							summary: undefined,
							capturedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
						});

						totalSaved++;
					} catch (err) {
						console.error(`Read It All: Failed to save item "${item.title}":`, err);
						totalSkipped++;
					}
				}
			} catch (err) {
				console.error(`Read It All: Failed to fetch feed "${feed.url}":`, err);
			}
		}

		console.log(`Read It All: Done. Saved ${totalSaved}, skipped ${totalSkipped}.`);
		if (totalSaved > 0) {
			new Notice(`Read It All: ✓ Saved ${totalSaved} new articles to your vault.`);
		} else {
			new Notice(`Read It All: No new articles found.`);
		}
	}

	private async parseFeed(url: string): Promise<ParsedFeed> {
		const response = await requestUrl({
			url,
			headers: { 'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*' }
		});

		if (response.status !== 200) {
			throw new Error(`HTTP ${response.status} fetching ${url}`);
		}

		return this.parseXML(response.text);
	}

	private parseXML(xml: string): ParsedFeed {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, 'text/xml');

		const isAtom = doc.querySelector('feed') !== null;
		if (isAtom) return this.parseAtom(doc);
		return this.parseRSS(doc);
	}

	private parseRSS(doc: Document): ParsedFeed {
		const title = doc.querySelector('channel > title')?.textContent ?? 'Untitled Feed';
		const items = Array.from(doc.querySelectorAll('item')).map(item => ({
			title: item.querySelector('title')?.textContent ?? 'Untitled',
			link: item.querySelector('link')?.textContent?.trim() ?? '',
			content: item.querySelector('content\\:encoded, encoded')?.textContent
				?? item.querySelector('description')?.textContent ?? '',
			contentSnippet: item.querySelector('description')?.textContent ?? '',
			author: item.querySelector('author, dc\\:creator')?.textContent ?? undefined,
			pubDate: item.querySelector('pubDate')?.textContent ?? undefined,
		}));
		return { title, items };
	}

	private parseAtom(doc: Document): ParsedFeed {
		const title = doc.querySelector('feed > title')?.textContent ?? 'Untitled Feed';
		const items = Array.from(doc.querySelectorAll('entry')).map(entry => {
			const link = entry.querySelector('link[rel="alternate"]')?.getAttribute('href')
				?? entry.querySelector('link')?.getAttribute('href') ?? '';
			return {
				title: entry.querySelector('title')?.textContent ?? 'Untitled',
				link,
				content: entry.querySelector('content')?.textContent ?? '',
				contentSnippet: entry.querySelector('summary')?.textContent ?? '',
				author: entry.querySelector('author > name')?.textContent ?? undefined,
				pubDate: entry.querySelector('published, updated')?.textContent ?? undefined,
			};
		});
		return { title, items };
	}

	private filterNewItems(items: RSSItem[]): RSSItem[] {
		if (!this.settings.lastRssFetch) return items;
		const lastFetch = new Date(this.settings.lastRssFetch);
		return items.filter(item => {
			if (!item.pubDate) return true;
			return new Date(item.pubDate) > lastFetch;
		});
	}
}
