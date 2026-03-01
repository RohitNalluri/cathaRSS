# Read It All — Setup Guide

## Prerequisites
- Node.js installed (https://nodejs.org — LTS version)
- Obsidian desktop app
- Chrome browser

---

## Step 1: Build the Plugin

Open Terminal and run:

```bash
cd read-it-all
npm install
npm run build
```

This creates a `main.js` file in the folder.

---

## Step 2: Install into Obsidian

1. In your vault, navigate to `.obsidian/plugins/` (hidden folder — enable hidden files in Finder with Cmd+Shift+.)
2. Create a folder called `read-it-all`
3. Copy these 3 files into it:
   - `main.js`
   - `manifest.json`
   - `styles.css` (if present)

4. Open Obsidian → Settings → Community Plugins
5. Turn off Safe Mode if prompted
6. Find **Read It All** in the list and enable it

---

## Step 3: Configure the Plugin

Go to Settings → Read It All. You'll see tabs for:

- **LLM**: Paste your OpenAI or OpenRouter API key. Start with `gpt-4o-mini`.
- **Vault Paths**: Defaults to `Resources/Inbox` — change if needed.
- **RSS Feeds**: Add your feed URLs one by one.
- **Digest**: Set to Sunday, 8 AM. Paste your interest profile.
- **Clipper**: Leave enabled on default port 27124.

---

## Step 4: Install the Chrome Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder from this project

The 📚 icon will appear in your Chrome toolbar.

---

## Step 5: Test It

**RSS:** In Obsidian, press Cmd+P → "Read It All: Fetch RSS feeds now". Check `Resources/Inbox/RSS/`.

**Clipper:** Open any article in Chrome, click the 📚 icon, click "Save to Vault". Check `Resources/Inbox/Clippings/`.

**Digest:** Press Cmd+P → "Read It All: Generate weekly digest now". Check `Resources/Digests/`.

---

## Rebuilding After Updates

When we update the plugin code:
```bash
cd read-it-all
npm run build
```
Then copy the new `main.js` to `.obsidian/plugins/read-it-all/` and reload Obsidian (Cmd+R).

---

## Your Vault Structure After Setup

```
Resources/
├── Inbox/
│   ├── RSS/
│   │   └── 2026-03-01 - Article Title.md
│   ├── Clippings/
│   │   └── 2026-03-01 - Article Title.md
│   └── Substack/
│       └── 2026-03-01 - Article Title.md
└── Digests/
    └── Week-2026-W09.md
```

Each note has:
- Frontmatter (source, URL, date, tags: inbox + unread)
- 3-bullet AI summary
- Key quotes
- Full article text

Remove the `unread` tag when you've read it — that's your simple read/done workflow.
