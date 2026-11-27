import { useEffect, useState } from 'react';

// Small preferences in chrome.storage.local (MAS-72). The API key is for the personal
// prototype only: local storage is not a vault; public distribution needs OAuth.
export interface Settings {
  linear_api_key?: string;
  default_linear_team_id?: string;
  default_linear_project_id?: string;
  default_linear_priority?: number; // 0 none, 1 urgent … 4 low
  default_linear_label_ids?: string[];
}

export async function getSettings(): Promise<Settings> {
  return (await browser.storage.local.get(null)) as Settings;
}

export async function saveSettings(patch: Partial<Settings>) {
  const remove = Object.keys(patch).filter((k) => patch[k as keyof Settings] === undefined);
  if (remove.length) await browser.storage.local.remove(remove);
  await browser.storage.local.set(patch);
}

/** Current settings, kept in sync with chrome.storage. Undefined while loading. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    const load = () => void getSettings().then(setSettings);
    load();
    browser.storage.local.onChanged.addListener(load);
    return () => browser.storage.local.onChanged.removeListener(load);
  }, []);
  return settings;
}
