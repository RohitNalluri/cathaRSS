// Background service worker
// Minimal for now — handles extension lifecycle.
// Can be extended to support right-click context menu in future.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Read It All clipper installed.');
});
