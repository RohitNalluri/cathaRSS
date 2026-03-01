import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import ReadItAllPlugin from './main';
import { RSSFeed } from './settings';

export class ReadItAllSettingTab extends PluginSettingTab {
	plugin: ReadItAllPlugin;

	constructor(app: App, plugin: ReadItAllPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h1', { text: 'Read It All' });
		containerEl.createEl('p', {
			text: 'Capture the web into your vault. Configure your sources, LLM, and digest below.',
			cls: 'setting-item-description'
		});

		// ── LLM ──────────────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '🤖 LLM Settings' });

		new Setting(containerEl)
			.setName('Provider')
			.setDesc('Which LLM API to use for summarization and digest generation.')
			.addDropdown(drop => drop
				.addOption('openai', 'OpenAI')
				.addOption('openrouter', 'OpenRouter')
				.setValue(this.plugin.settings.llmProvider)
				.onChange(async (value: 'openai' | 'openrouter') => {
					this.plugin.settings.llmProvider = value;
					// Update default model suggestion
					if (value === 'openai') {
						modelSetting.setDesc('Recommended: gpt-4o-mini (fast + cheap) or gpt-4o');
					} else {
						modelSetting.setDesc('e.g. mistralai/mistral-7b-instruct or anthropic/claude-3-haiku');
					}
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your API key. Stored locally in your vault, never transmitted except to your chosen provider.')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value.trim();
					await this.plugin.saveSettings();
				})
			);

		const modelSetting = new Setting(containerEl)
			.setName('Model')
			.setDesc('Recommended: gpt-4o-mini (fast + cheap) or gpt-4o')
			.addText(text => text
				.setPlaceholder('gpt-4o-mini')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value.trim();
					await this.plugin.saveSettings();
				})
			);

		// ── VAULT ─────────────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '📁 Vault Paths' });

		new Setting(containerEl)
			.setName('Inbox folder')
			.setDesc('Where captured articles are saved. Subfolders RSS/, Clippings/, and Substack/ will be created automatically.')
			.addText(text => text
				.setPlaceholder('Resources/Inbox')
				.setValue(this.plugin.settings.inboxPath)
				.onChange(async (value) => {
					this.plugin.settings.inboxPath = value.trim();
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Digest folder')
			.setDesc('Where weekly digest notes are saved.')
			.addText(text => text
				.setPlaceholder('Resources/Digests')
				.setValue(this.plugin.settings.digestPath)
				.onChange(async (value) => {
					this.plugin.settings.digestPath = value.trim();
					await this.plugin.saveSettings();
				})
			);

		// ── RSS ───────────────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '🗞 RSS Feeds' });

		new Setting(containerEl)
			.setName('Fetch interval')
			.setDesc('How often to check feeds for new articles (in hours).')
			.addSlider(slider => slider
				.setLimits(1, 24, 1)
				.setValue(this.plugin.settings.rssFetchIntervalHours)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.rssFetchIntervalHours = value;
					await this.plugin.saveSettings();
				})
			);

		// OPML Import
		new Setting(containerEl)
			.setName('Import OPML file')
			.setDesc('Bulk import feeds from an OPML file exported from any RSS reader.')
			.addButton(btn => btn
				.setButtonText('Choose OPML file...')
				.onClick(() => {
					const input = document.createElement('input');
					input.type = 'file';
					input.accept = '.opml,.xml';
					input.onchange = async (e) => {
						const file = (e.target as HTMLInputElement).files?.[0];
						if (!file) return;

						const text = await file.text();
						const imported = this.parseOPML(text);

						if (imported.length === 0) {
							new Notice('No feeds found in that OPML file.');
							return;
						}

						// Merge, skipping duplicates by URL
						const existingUrls = new Set(this.plugin.settings.rssFeeds.map(f => f.url));
						const newFeeds = imported.filter(f => !existingUrls.has(f.url));

						this.plugin.settings.rssFeeds.push(...newFeeds);
						await this.plugin.saveSettings();
						this.display();
						new Notice(`✓ Imported ${newFeeds.length} feeds. ${imported.length - newFeeds.length} duplicates skipped.`);
					};
					input.click();
				})
			);

		// Feed list
		const feedListEl = containerEl.createDiv('feed-list');
		this.renderFeedList(feedListEl);

		// Add feed form
		containerEl.createEl('h3', { text: 'Add a feed' });
		let newFeedUrl = '';
		let newFeedName = '';

		new Setting(containerEl)
			.setName('Feed URL')
			.addText(text => text
				.setPlaceholder('https://example.com/feed.xml')
				.onChange(value => { newFeedUrl = value.trim(); })
			);

		new Setting(containerEl)
			.setName('Feed name')
			.setDesc('A friendly label for this feed.')
			.addText(text => text
				.setPlaceholder('My Favourite Blog')
				.onChange(value => { newFeedName = value.trim(); })
			);

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText('Add Feed')
				.setCta()
				.onClick(async () => {
					if (!newFeedUrl) {
						new Notice('Please enter a feed URL.');
						return;
					}
					const feed: RSSFeed = {
						url: newFeedUrl,
						name: newFeedName || newFeedUrl,
						enabled: true,
					};
					this.plugin.settings.rssFeeds.push(feed);
					await this.plugin.saveSettings();
					this.display(); // re-render
					new Notice(`Feed added: ${feed.name}`);
				})
			);

		// ── DIGEST ────────────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '📋 Weekly Digest' });

		new Setting(containerEl)
			.setName('Digest day')
			.setDesc('Which day of the week the digest is generated.')
			.addDropdown(drop => drop
				.addOption('0', 'Sunday')
				.addOption('1', 'Monday')
				.addOption('2', 'Tuesday')
				.addOption('3', 'Wednesday')
				.addOption('4', 'Thursday')
				.addOption('5', 'Friday')
				.addOption('6', 'Saturday')
				.setValue(String(this.plugin.settings.digestDayOfWeek))
				.onChange(async (value) => {
					this.plugin.settings.digestDayOfWeek = parseInt(value);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Digest hour')
			.setDesc('What hour (24h) to generate the digest. 8 = 8:00 AM.')
			.addSlider(slider => slider
				.setLimits(0, 23, 1)
				.setValue(this.plugin.settings.digestHour)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.digestHour = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName('Your interest profile')
			.setDesc('A few sentences about what you care about. The LLM uses this to pick the best articles to recommend each week.')
			.addTextArea(text => {
				text
					.setPlaceholder('I am interested in AI, philosophy, startups, writing, and the future of work. I prefer long-form essays over news articles...')
					.setValue(this.plugin.settings.interestProfile)
					.onChange(async (value) => {
						this.plugin.settings.interestProfile = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 4;
				text.inputEl.style.width = '100%';
			});

		// ── CLIPPER ───────────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '📎 Chrome Clipper' });

		new Setting(containerEl)
			.setName('Enable clipper server')
			.setDesc('Runs a local server so the Chrome extension can send articles to your vault.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.clipperEnabled)
				.onChange(async (value) => {
					this.plugin.settings.clipperEnabled = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.startClipperServer();
					} else {
						this.plugin.stopClipperServer();
					}
				})
			);

		new Setting(containerEl)
			.setName('Clipper port')
			.setDesc('Local port for the Chrome extension to connect to. Default 27124.')
			.addText(text => text
				.setValue(String(this.plugin.settings.clipperPort))
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 1024 && port < 65535) {
						this.plugin.settings.clipperPort = port;
						await this.plugin.saveSettings();
					}
				})
			);

		// ── SUMMARIZER ───────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '✨ AI Summarizer' });

		new Setting(containerEl)
			.setName('Nightly summarization hour')
			.setDesc('What hour (24h) to run AI summarization each night. 21 = 9:00 PM.')
			.addSlider(slider => slider
				.setLimits(0, 23, 1)
				.setValue(this.plugin.settings.summarizerHour)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.summarizerHour = value;
					await this.plugin.saveSettings();
				})
			);

		// ── MANUAL ACTIONS ────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: '⚡ Actions' });

		new Setting(containerEl)
			.setName('Fetch RSS now')
			.setDesc('Manually trigger an RSS fetch right now.')
			.addButton(btn => btn
				.setButtonText('Fetch Now')
				.onClick(async () => {
					new Notice('Fetching RSS feeds...');
					await this.plugin.fetchRSSFeeds();
					new Notice('RSS fetch complete!');
				})
			);

		new Setting(containerEl)
			.setName('Generate digest now')
			.setDesc('Manually generate this week\'s digest right now.')
			.addButton(btn => btn
				.setButtonText('Generate Digest')
				.setCta()
				.onClick(async () => {
					new Notice('Generating weekly digest...');
					await this.plugin.generateWeeklyDigest();
					new Notice('Digest generated! Check your Digests folder.');
				})
			);

		new Setting(containerEl)
			.setName('Summarize now')
			.setDesc('Run AI summarization on all unsummarized articles right now.')
			.addButton(btn => btn
				.setButtonText('Summarize Now')
				.onClick(async () => {
					new Notice('Read It All: Starting summarization...');
					await this.plugin.summarizer.runQueue();
					new Notice('Read It All: Summarization complete!');
				})
			);
	}

	private parseOPML(xml: string): RSSFeed[] {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, 'text/xml');
		const outlines = Array.from(doc.querySelectorAll('outline[xmlUrl], outline[xmlurl]'));

		return outlines.map(el => ({
			url: el.getAttribute('xmlUrl') || el.getAttribute('xmlurl') || '',
			name: el.getAttribute('title') || el.getAttribute('text') || el.getAttribute('xmlUrl') || 'Unnamed Feed',
			enabled: true,
		})).filter(f => f.url.length > 0);
	}

	private renderFeedList(container: HTMLElement): void {
		container.empty();

		if (this.plugin.settings.rssFeeds.length === 0) {
			container.createEl('p', {
				text: 'No feeds added yet.',
				cls: 'setting-item-description'
			});
			return;
		}

		this.plugin.settings.rssFeeds.forEach((feed, index) => {
			new Setting(container)
				.setName(feed.name)
				.setDesc(feed.url)
				.addToggle(toggle => toggle
					.setValue(feed.enabled)
					.onChange(async (value) => {
						this.plugin.settings.rssFeeds[index].enabled = value;
						await this.plugin.saveSettings();
					})
				)
				.addButton(btn => btn
					.setIcon('trash')
					.setTooltip('Remove feed')
					.onClick(async () => {
						this.plugin.settings.rssFeeds.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);
		});
	}
}
