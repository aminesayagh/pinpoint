import { syncContentScript } from '@/lib/sites';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Keep the content script registered exactly on the sites the reviewer allowed.
  browser.permissions.onAdded.addListener(syncContentScript);
  browser.permissions.onRemoved.addListener(syncContentScript);
  browser.runtime.onInstalled.addListener(syncContentScript);
});
