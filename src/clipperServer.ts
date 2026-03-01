import { Notice, requestUrl } from 'obsidian';
import { LLMService } from './llm';
import { NoteWriter, SourceType } from './noteWriter';
import { ReadItAllSettings } from './settings';

interface ClipPayload {
	title: string;
	url: string;
	content: string;
	selectedText?: string;
	source: SourceType;
	author?: string;
}

export class ClipperServer {
	private settings: ReadItAllSettings;
	private llm: LLMService;
	private noteWriter: NoteWriter;
	private server: any = null;

	constructor(settings: ReadItAllSettings, llm: LLMService, noteWriter: NoteWriter) {
		this.settings = settings;
		this.llm = llm;
		this.noteWriter = noteWriter;
	}

	async start(): Promise<void> {
		if (this.server) return;

		try {
			const http = require('http');

			this.server = http.createServer(async (req: any, res: any) => {
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

				if (req.method === 'OPTIONS') {
					res.writeHead(204);
					res.end();
					return;
				}

				if (req.method === 'POST' && req.url === '/clip') {
					let body = '';
					req.on('data', (chunk: any) => { body += chunk.toString(); });
					req.on('end', async () => {
						try {
							const payload: ClipPayload = JSON.parse(body);
							await this.handleClip(payload);
							res.writeHead(200, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ success: true }));
						} catch (err) {
							console.error('Read It All clipper error:', err);
							res.writeHead(500, { 'Content-Type': 'application/json' });
							res.end(JSON.stringify({ success: false, error: String(err) }));
						}
					});
				} else if (req.method === 'GET' && req.url === '/ping') {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ status: 'ok', plugin: 'read-it-all' }));
				} else {
					res.writeHead(404);
					res.end();
				}
			});

			this.server.listen(this.settings.clipperPort, '127.0.0.1', () => {
				console.log(`Read It All: Clipper server running on port ${this.settings.clipperPort}`);
			});

		} catch (err) {
			console.error('Read It All: Failed to start clipper server:', err);
			new Notice('Read It All: Could not start clipper server. Check console.');
		}
	}

	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
			console.log('Read It All: Clipper server stopped.');
		}
	}

	private async handleClip(payload: ClipPayload): Promise<void> {
		const content = payload.selectedText?.trim() || payload.content;

		// Save immediately without LLM — never block article capture on API calls
		await this.noteWriter.saveArticle({
			title: payload.title,
			url: payload.url,
			author: payload.author,
			content: content.slice(0, 100000), // cap content size
			source: payload.source,
			summary: undefined,
			capturedAt: new Date(),
		});

		new Notice(`📎 Clipped: ${payload.title.slice(0, 50)}`);

		// Summarize in background after saving — failures won't affect the clip
		if (this.settings.apiKey) {
			this.summarizeInBackground(payload.title, content, payload.url, payload.source);
		}
	}

	private async summarizeInBackground(
		title: string,
		content: string,
		url: string,
		source: SourceType
	): Promise<void> {
		try {
			// Small delay to let the file get created and indexed
			await new Promise(resolve => setTimeout(resolve, 2000));
			const summary = await this.llm.summarizeArticle(title, content);
			console.log(`Read It All: Summary generated for "${title}"`);
			// TODO: update the note with summary in a future update
		} catch (err) {
			console.error(`Read It All: Background summarization failed for "${title}":`, err);
		}
	}
}
