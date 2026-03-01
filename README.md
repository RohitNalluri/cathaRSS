# cathaRSS

> Capture everything you read. Summarized. In your vault. No subscriptions required.

cathaRSS brings your reading life into Obsidian. RSS feeds, web articles, and Substack posts land in your vault automatically — each one summarized by AI, ready to read, tag, and connect to your notes.

Think of it as a self-hosted Readwise, built entirely on tools you already own.

---

## Features

### 📡 RSS Feed Fetching
Add any RSS or Atom feed and cathaRSS fetches new articles automatically every 6 hours. Import your existing subscriptions in one click via OPML from any feed reader.

### 📎 Chrome Extension Clipper
Save any webpage or Substack article to your vault with one click from Chrome. The extension auto-detects Substack posts and labels them accordingly.

### ✨ AI Summarization
Every new article gets a 3-bullet summary and key quotes extracted automatically each night. Bring your own API key — works with OpenAI, or any model via OpenRouter (Claude, Kimi, Gemini, Mistral, and more).

### 📋 Weekly Digest
Every Sunday morning, cathaRSS generates a digest note recommending the best articles from your week based on your interest profile.

### 🔵 Unread Indicator
The cathaRSS bookmark icon in your Obsidian sidebar pulses blue when unread articles are waiting. Goes grey when you're all caught up.

---

## What It Looks Like

Articles land in your vault like this:

```markdown
---
source: RSS
url: https://simonwillison.net/2026/Feb/28/...
author: Simon Willison
date_captured: 2026-02-28
tags:
  - inbox
  - unread
  - rss
---

## Summary
- The article explores how AI coding tools are changing the way solo developers work...
- Key finding: developers using agentic coding tools ship 2-3x faster on greenfield projects...
- The author argues the bottleneck has shifted from writing code to reviewing it...

## Key Quotes
> "The question is no longer whether AI can write code — it's whether you can review it fast enough."

> "Vibe coding is real, but so is vibe debugging."

## Full Article
...full text...
```

---

## Installation

### Plugin

1. In Obsidian, open **Settings → Community Plugins**
2. Search for **cathaRSS** and install
3. Enable the plugin
4. Go to **Settings → cathaRSS** and configure:
   - Your OpenAI or OpenRouter API key
   - Your vault's inbox folder path
   - Add your RSS feeds (or import via OPML)

### Chrome Extension

1. Download the `chrome-extension` folder from this repo
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `chrome-extension` folder
5. Pin the cathaRSS icon to your toolbar

---

## Configuration

| Setting | Description | Default |
|---|---|---|
| LLM Provider | OpenAI or OpenRouter | OpenAI |
| API Key | Your API key | — |
| Model | Any chat model (e.g. `gpt-4o-mini`, `anthropic/claude-haiku-4-5-20251001`) | `gpt-4o-mini` |
| Inbox Path | Vault folder for captured articles | `Resources/Inbox` |
| Fetch Interval | How often to check feeds (hours) | `6` |
| Summarizer Hour | What time to run nightly summarization (24h) | `21` (9 PM) |
| Digest Day | Day of week for weekly digest | Sunday |
| Interest Profile | Describe your interests to personalize the digest | — |

---

## Recommended Models

cathaRSS works with any OpenAI-compatible API. Via [OpenRouter](https://openrouter.ai) you can use:

- `openai/gpt-4o-mini` — fast, cheap, reliable (recommended default)
- `anthropic/claude-haiku-4-5-20251001` — excellent at structured extraction
- `moonshotai/kimi-k2` — strong reasoning, good JSON output
- `google/gemini-flash-1.5` — very fast and cheap

---

## How Summarization Works

cathaRSS never blocks article capture on AI. Articles always save instantly. Summarization runs as a background queue each night at your configured hour — processing one article at a time with a short pause between calls to respect API rate limits.

Articles are tracked via frontmatter tags:
- `unread` — article has been captured but not read
- `summarized` — AI has processed this article

The summarizer only processes articles that have `unread` but not `summarized` — so it never re-processes articles and never touches your existing notes.

---

## Privacy

- All your articles are stored locally in your vault
- AI summarization calls go directly from Obsidian to your chosen API provider
- No data passes through any cathaRSS server — there isn't one
- The Chrome extension only communicates with `localhost:27124` (your local Obsidian)

---

## Roadmap

- [ ] Mark as read when note is opened
- [ ] Mobile support (iOS / Android)
- [ ] Kindle highlights sync
- [ ] Gmail digest capture
- [ ] Per-feed summarization toggle
- [ ] Tag-based filtering in weekly digest

---

## Contributing

Contributions are very welcome! This plugin was built to scratch a personal itch and open-sourced to give back to the community.

- **Bug reports** — open an issue with your console logs
- **Feature requests** — open an issue describing your use case
- **Pull requests** — please open an issue first to discuss

### Development Setup

```bash
git clone https://github.com/RohitNalluri/cathaRSS
cd cathaRSS
npm install
npm run dev   # watch mode — rebuilds on file changes
```

Copy the repo folder into your vault's `.obsidian/plugins/` directory and enable it in Obsidian settings.

---

## License

MIT — do whatever you want with it.

---

## Acknowledgements

Built with [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api). Inspired by Readwise, Omnivore, and the broader PKM community's obsession with capturing everything worth reading.

If cathaRSS saves you a Readwise subscription, consider [sponsoring development](https://github.com/sponsors/YOUR_USERNAME). ☕
