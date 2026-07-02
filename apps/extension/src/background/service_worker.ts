// Service worker — message bus between content script, popup, and web app.
// Tracks per-tab MBS status; stores the Supabase session token in
// chrome.storage.session (cleared when the browser closes).

interface TabStatus {
  on_mbs: boolean;
  platform: 'facebook' | 'instagram';
}

const tabStatuses = new Map<number, TabStatus>();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'MBS_STATUS' && sender.tab?.id !== undefined) {
    tabStatuses.set(sender.tab.id, { on_mbs: msg.on_mbs, platform: msg.platform });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_ACTIVE_TAB_STATUS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const isMbsUrl = tab?.url?.startsWith('https://business.facebook.com/') ?? false;
      const status = tab?.id !== undefined ? tabStatuses.get(tab.id) : undefined;
      sendResponse({
        on_mbs: isMbsUrl,
        platform: status?.platform ?? (isMbsUrl ? 'facebook' : null),
      });
    });
    return true; // async response
  }

  if (msg.type === 'SET_AUTH') {
    chrome.storage.session.set({ auth_token: msg.token, org_id: msg.org_id }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CLEAR_AUTH') {
    chrome.storage.session.remove(['auth_token', 'org_id'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatuses.delete(tabId);
});
