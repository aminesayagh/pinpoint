import { useEffect, useState } from 'react';

/** The active tab of the side panel's window, updated on tab switches and navigation. */
export function useActiveTab() {
  const [tab, setTab] = useState<Browser.tabs.Tab>();
  useEffect(() => {
    const load = () =>
      void browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t));
    const onUpdated = (_id: number, info: Browser.tabs.OnUpdatedInfo) => {
      if (info.url || info.status === 'complete') load();
    };
    load();
    browser.tabs.onActivated.addListener(load);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(load);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return tab;
}
