let selectedSource = 'Clipping';
let port = 27124;

async function getPort() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['clipperPort'], (result) => {
      resolve(result.clipperPort || 27124);
    });
  });
}

async function ping(p) {
  try {
    const res = await fetch(`http://127.0.0.1:${p}/ping`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function getPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSelectedText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || '',
    });
    return results[0]?.result || '';
  } catch {
    return '';
  }
}

async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body.innerText || '',
    });
    return results[0]?.result || '';
  } catch {
    return '';
  }
}

function detectSource(url) {
  if (url.includes('substack.com')) return 'Substack';
  return 'Clipping';
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  port = await getPort();
  document.getElementById('port-input').value = port;

  // Check connection
  const connected = await ping(port);
  const statusEl = document.getElementById('status');
  const statusText = document.getElementById('status-text');
  const clipBtn = document.getElementById('clip-btn');

  if (connected) {
    statusEl.className = 'status connected';
    statusText.textContent = 'Connected to Obsidian';
    clipBtn.disabled = false;
  } else {
    statusEl.className = 'status disconnected';
    statusText.textContent = 'Obsidian not reachable — is it open?';
  }

  // Page info
  const tab = await getPageInfo();
  document.getElementById('page-title').textContent = tab.title || 'Untitled';
  document.getElementById('page-url').textContent = tab.url || '';

  // Auto-detect source
  selectedSource = detectSource(tab.url || '');
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.source === selectedSource);
  });

  // Selected text
  const selection = await getSelectedText();
  const selectionNote = document.getElementById('selection-note');
  if (selection && selection.trim().length > 10) {
    selectionNote.textContent = `✓ ${selection.length} chars selected — will clip selection only.`;
    selectionNote.className = 'selection-note has-selection';
  }

  // Source buttons
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedSource = btn.dataset.source;
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Port change
  document.getElementById('port-input').addEventListener('change', async (e) => {
    port = parseInt(e.target.value);
    chrome.storage.local.set({ clipperPort: port });
  });

  // Clip button
  clipBtn.addEventListener('click', async () => {
    clipBtn.disabled = true;
    clipBtn.textContent = 'Saving...';
    const feedback = document.getElementById('feedback');

    try {
      const tab = await getPageInfo();
      const selection = await getSelectedText();
      const content = selection?.trim() || await getPageContent();

      const payload = {
        title: tab.title || 'Untitled',
        url: tab.url || '',
        content: content.slice(0, 50000),
        selectedText: selection?.trim() || null,
        source: selectedSource,
        author: null,
      };

      const res = await fetch(`http://127.0.0.1:${port}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        feedback.textContent = '✓ Saved to vault!';
        feedback.className = 'feedback';
        clipBtn.textContent = '✓ Done';
        setTimeout(() => window.close(), 1200);
      } else {
        throw new Error(`Server error: ${res.status}`);
      }
    } catch (err) {
      feedback.textContent = `Error: ${err.message}`;
      feedback.className = 'feedback error';
      clipBtn.disabled = false;
      clipBtn.textContent = 'Save to Vault';
    }
  });
});
