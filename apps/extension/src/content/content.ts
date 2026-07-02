// Content script — runs ONLY on https://business.facebook.com/* (per manifest).
// Detects which section of Meta Business Suite the user is in and reports it
// to the extension so the popup can enforce platform separation.

import type { Platform } from '@repo/types';

function detectPlatform(): Platform {
  const url = window.location.href.toLowerCase();
  // Instagram sections of Meta Business Suite carry instagram in path/params
  if (
    url.includes('instagram') ||
    url.includes('asset_id_ig') ||
    document.querySelector('[aria-label*="Instagram"]') !== null
  ) {
    return 'instagram';
  }
  return 'facebook';
}

function report() {
  chrome.runtime.sendMessage({
    type: 'MBS_STATUS',
    on_mbs: true,
    platform: detectPlatform(),
  });
}

report();

// Meta Business Suite is an SPA — watch for URL changes
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    report();
  }
}).observe(document.body, { childList: true, subtree: true });

// Re-report when the tab regains focus
window.addEventListener('focus', report);
