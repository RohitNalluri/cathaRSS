export interface RSSFeed {
	url: string;
	name: string;
	enabled: boolean;
}

export interface ReadItAllSettings {
	// LLM
	llmProvider: 'openai' | 'openrouter';
	apiKey: string;
	model: string;

	// Vault paths
	inboxPath: string;
	digestPath: string;

	// RSS
	rssFeeds: RSSFeed[];
	rssFetchIntervalHours: number;
	lastRssFetch: string;

	// Digest
	digestDayOfWeek: number;
	digestHour: number;
	lastDigestGenerated: string;
	interestProfile: string;

	// Summarizer
	summarizerHour: number;
	lastSummarizerRun: string;

	// Chrome extension server
	clipperPort: number;
	clipperEnabled: boolean;
}

export const DEFAULT_SETTINGS: ReadItAllSettings = {
	llmProvider: 'openai',
	apiKey: '',
	model: 'gpt-4o-mini',

	inboxPath: 'Resources/Inbox',
	digestPath: 'Resources/Digests',

	rssFeeds: [],
	rssFetchIntervalHours: 6,
	lastRssFetch: '',

	digestDayOfWeek: 0,
	digestHour: 8,
	lastDigestGenerated: '',
	interestProfile: '',

	summarizerHour: 21, // 9 PM default
	lastSummarizerRun: '',

	clipperPort: 27124,
	clipperEnabled: true,
};
