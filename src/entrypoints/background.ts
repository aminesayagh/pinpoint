import type { FromBackground } from '@/lib/messages';
import { syncContentScript } from '@/lib/sites';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Keep the content script registered exactly on the sites the reviewer allowed.
  browser.permissions.onAdded.addListener(syncContentScript);
  browser.permissions.onRemoved.addListener(syncContentScript);
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes.allowed_sites) void syncContentScript();
  });
  browser.runtime.onInstalled.addListener(syncContentScript);

  // Alt+Shift+S: open the side panel and ask it to start selecting in the current tab.
  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'select-element' || !tab?.windowId) return;
    void browser.sidePanel
      .open({ windowId: tab.windowId })
      .then(() =>
        browser.runtime
          .sendMessage({ type: 'pinpoint:shortcut-select' } satisfies FromBackground)
          .catch(() => {}),
      );
  });
});
