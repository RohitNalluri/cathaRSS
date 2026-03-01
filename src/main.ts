import { Plugin, Notice, addIcon } from 'obsidian';
import { ReadItAllSettings, DEFAULT_SETTINGS } from './settings';
import { ReadItAllSettingTab } from './settingsTab';
import { LLMService } from './llm';
import { NoteWriter } from './noteWriter';
import { RSSFetcher } from './rssFetcher';
import { ClipperServer } from './clipperServer';
import { DigestGenerator } from './digestGenerator';
import { Summarizer } from './summarizer';

const ICON_ID = 'read-it-all-icon';

export default class ReadItAllPlugin extends Plugin {
	settings: ReadItAllSettings;

	private llm: LLMService;
	private noteWriter: NoteWriter;
	private rssFetcher: RSSFetcher;
	private clipperServer: ClipperServer;
	private digestGenerator: DigestGenerator;
	summarizer: Summarizer;

	private rssInterval: number | null = null;
	private digestCheckInterval: number | null = null;
	private unreadCheckInterval: number | null = null;
	private summarizerInterval: number | null = null;
	private ribbonEl: HTMLElement | null = null;
	private styleEl: HTMLStyleElement | null = null;

	async onload() {
		await this.loadSettings();
		this.initServices();
		this.injectStyles();

		addIcon(ICON_ID, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
			<path d="M20 10 L20 90 L50 75 L80 90 L80 10 Z" 
				fill="currentColor" stroke="currentColor" stroke-width="4" 
				stroke-linejoin="round"/>
		</svg>`);

		this.ribbonEl = this.addRibbonIcon(ICON_ID, 'Read It All', () => {
			new Notice('Read It All: Use the Chrome extension to clip, or Cmd+P for commands.');
		});
		this.ribbonEl.addClass('read-it-all-ribbon');

		this.addSettingTab(new ReadItAllSettingTab(this.app, this));

		// Commands
		this.addCommand({
			id: 'fetch-rss',
			name: 'Fetch RSS feeds now',
			callback: async () => { await this.fetchRSSFeeds(); }
		});

		this.addCommand({
			id: 'generate-digest',
			name: 'Generate weekly digest now',
			callback: async () => {
				new Notice('Read It All: Generating digest...');
				await this.generateWeeklyDigest();
				new Notice('Read It All: Digest ready!');
			}
		});

		this.addCommand({
			id: 'summarize-now',
			name: 'Summarize unsummarized articles now',
			callback: async () => {
				if (this.summarizer.running) {
					new Notice('Read It All: Summarizer is already running.');
					return;
				}
				new Notice('Read It All: Starting summarization...');
				await this.summarizer.runQueue();
				new Notice('Read It All: Summarization complete!');
			}
		});

		this.addCommand({
			id: 'mark-all-read',
			name: 'Mark all inbox articles as read',
			callback: async () => {
				await this.markAllRead();
				new Notice('Read It All: All articles marked as read.');
				this.updateRibbonState('idle');
			}
		});

		// Background timers
		this.startRSSInterval();
		this.startDigestCheck();
		this.startUnreadCheck();
		this.startSummarizerSchedule();

		if (this.settings.clipperEnabled) {
			await this.startClipperServer();
		}

		setTimeout(() => this.checkUnread(), 3000);

		console.log('Read It All: Plugin loaded.');
	}

	onunload() {
		this.stopClipperServer();
		if (this.rssInterval) window.clearInterval(this.rssInterval);
		if (this.digestCheckInterval) window.clearInterval(this.digestCheckInterval);
		if (this.unreadCheckInterval) window.clearInterval(this.unreadCheckInterval);
		if (this.summarizerInterval) window.clearInterval(this.summarizerInterval);
		this.styleEl?.remove();
		console.log('Read It All: Plugin unloaded.');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.initServices();
	}

	// ── Public methods ────────────────────────────────────────────────────────

	async fetchRSSFeeds(): Promise<void> {
		this.updateRibbonState('fetching');
		new Notice('Read It All: Fetching RSS feeds...');
		await this.rssFetcher.fetchAll();
		this.settings.lastRssFetch = new Date().toISOString();
		await this.saveData(this.settings);
		await this.checkUnread();
	}

	async generateWeeklyDigest(): Promise<void> {
		await this.digestGenerator.generate();
		this.settings.lastDigestGenerated = new Date().toISOString();
		await this.saveData(this.settings);
	}

	async startClipperServer(): Promise<void> {
		await this.clipperServer.start();
	}

	stopClipperServer(): void {
		this.clipperServer.stop();
	}

	// ── Unread indicator ──────────────────────────────────────────────────────

	async checkUnread(): Promise<void> {
		const count = await this.countUnread();
		if (count > 0) {
			this.updateRibbonState('unread', count);
		} else {
			this.updateRibbonState('idle');
		}
	}

	private async countUnread(): Promise<number> {
		const files = this.app.vault.getMarkdownFiles().filter(f =>
			f.path.startsWith(this.settings.inboxPath)
		);
		let count = 0;
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache?.frontmatter?.tags ?? [];
			const tagList = Array.isArray(tags) ? tags : [tags];
			if (tagList.includes('unread')) count++;
		}
		return count;
	}

	private async markAllRead(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles().filter(f =>
			f.path.startsWith(this.settings.inboxPath)
		);
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache?.frontmatter?.tags ?? [];
			const tagList: string[] = Array.isArray(tags) ? tags : [tags];
			if (tagList.includes('unread')) {
				const content = await this.app.vault.read(file);
				const updated = content.replace(/^  - unread\n/m, '');
				await this.app.vault.modify(file, updated);
			}
		}
	}

	updateRibbonState(state: 'idle' | 'unread' | 'fetching', count = 0): void {
		if (!this.ribbonEl) return;
		this.ribbonEl.removeClass('ria-idle', 'ria-unread', 'ria-fetching');
		this.ribbonEl.addClass(`ria-${state}`);
		if (state === 'unread') {
			this.ribbonEl.setAttribute('aria-label', `Read It All — ${count} unread`);
		} else if (state === 'fetching') {
			this.ribbonEl.setAttribute('aria-label', 'Read It All — Fetching...');
		} else {
			this.ribbonEl.setAttribute('aria-label', 'Read It All — All caught up');
		}
	}

	// ── Styles ────────────────────────────────────────────────────────────────

	private injectStyles(): void {
		this.styleEl = document.createElement('style');
		this.styleEl.id = 'read-it-all-styles';
		this.styleEl.textContent = `
			.read-it-all-ribbon svg { transition: color 0.3s ease; }

			.read-it-all-ribbon.ria-idle svg { color: var(--icon-color); }

			.read-it-all-ribbon.ria-unread svg {
				color: #4a9eff;
				filter: drop-shadow(0 0 4px #4a9eff88);
				animation: ria-pulse 2.5s ease-in-out infinite;
			}

			.read-it-all-ribbon.ria-fetching svg {
				color: #4a9eff;
				animation: ria-spin 1.2s linear infinite;
			}

			@keyframes ria-pulse {
				0%, 100% { opacity: 1; filter: drop-shadow(0 0 3px #4a9eff66); }
				50% { opacity: 0.5; filter: drop-shadow(0 0 8px #4a9effcc); }
			}

			@keyframes ria-spin {
				from { transform: rotate(0deg); }
				to { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(this.styleEl);
	}

	// ── Background timers ─────────────────────────────────────────────────────

	private initServices(): void {
		this.llm = new LLMService(this.settings);
		this.noteWriter = new NoteWriter(this.app, this.settings);
		this.rssFetcher = new RSSFetcher(this.settings, this.llm, this.noteWriter);
		this.clipperServer = new ClipperServer(this.settings, this.llm, this.noteWriter);
		this.digestGenerator = new DigestGenerator(this.app, this.settings, this.llm, this.noteWriter);
		this.summarizer = new Summarizer(this.app, this.settings, this.llm);
	}

	private startRSSInterval(): void {
		if (this.rssInterval) window.clearInterval(this.rssInterval);
		const ms = this.settings.rssFetchIntervalHours * 60 * 60 * 1000;
		this.rssInterval = window.setInterval(async () => {
			await this.fetchRSSFeeds();
		}, ms);
	}

	private startDigestCheck(): void {
		if (this.digestCheckInterval) window.clearInterval(this.digestCheckInterval);
		this.digestCheckInterval = window.setInterval(async () => {
			if (this.digestGenerator.shouldGenerateToday()) {
				await this.generateWeeklyDigest();
				new Notice('Read It All: Weekly digest generated!');
			}
		}, 60 * 60 * 1000);
	}

	private startUnreadCheck(): void {
		if (this.unreadCheckInterval) window.clearInterval(this.unreadCheckInterval);
		this.unreadCheckInterval = window.setInterval(async () => {
			await this.checkUnread();
		}, 5 * 60 * 1000);
	}

	private startSummarizerSchedule(): void {
		if (this.summarizerInterval) window.clearInterval(this.summarizerInterval);
		// Check every hour — run summarizer once per night at the configured hour
		this.summarizerInterval = window.setInterval(async () => {
			const now = new Date();
			const isNightHour = now.getHours() === this.settings.summarizerHour;
			const lastRun = this.settings.lastSummarizerRun
				? new Date(this.settings.lastSummarizerRun)
				: null;
			const ranToday = lastRun && lastRun.toDateString() === now.toDateString();

			if (isNightHour && !ranToday && !this.summarizer.running) {
				console.log('Read It All: Starting nightly summarization...');
				await this.summarizer.runQueue();
				this.settings.lastSummarizerRun = now.toISOString();
				await this.saveData(this.settings);
			}
		}, 60 * 60 * 1000);
	}
}
