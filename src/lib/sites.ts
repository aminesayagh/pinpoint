// Site access. Chrome only allows screenshots with access to all websites (or a fresh toolbar
// click), so Pinpoint asks Chrome once for all sites, and keeps its own list of the sites the
// reviewer allowed: the selection script only ever loads on those. Localhost works like any site.

const ALL_SITES = '<all_urls>';

/** Match pattern for the site of a URL, any port: `http://localhost/*`. Undefined for chrome:// etc. */
export function sitePattern(url: string | undefined) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.hostname}/*` : undefined;
  } catch {
    return undefined;
  }
}

async function allowedList() {
  const { allowed_sites = [] } = (await browser.storage.local.get('allowed_sites')) as {
    allowed_sites?: string[];
  };
  return allowed_sites;
}

/** Sites Pinpoint may review now: the reviewer's list, if Chrome still grants all sites. */
export async function grantedSites(): Promise<string[]> {
  return (await browser.permissions.contains({ origins: [ALL_SITES] })) ? allowedList() : [];
}

export async function hasSiteAccess(url: string | undefined) {
  const site = sitePattern(url);
  return !!site && (await grantedSites()).includes(site);
}

/** Must run inside a click handler: Chrome only shows its prompt for a user gesture. */
export async function requestSiteAccess(url: string | undefined) {
  const site = sitePattern(url);
  if (!site) return false;
  // Ask Chrome first, before any await that could lose the click's user activation.
  if (!(await browser.permissions.request({ origins: [ALL_SITES] }))) return false;
  const list = await allowedList();
  if (!list.includes(site)) await browser.storage.local.set({ allowed_sites: [...list, site] });
  return true;
}

/** Takes the site off Pinpoint's list. Chrome's all-sites grant stays for the other sites. */
export async function removeSiteAccess(url: string | undefined) {
  const site = sitePattern(url);
  if (!site) return false;
  await browser.storage.local.set({
    allowed_sites: (await allowedList()).filter((s) => s !== site),
  });
  return true;
}

export const CONTENT_SCRIPT = 'content-scripts/content.js';

/** Registers the content script on every allowed site so it loads after each navigation. */
export async function syncContentScript() {
  const matches = await grantedSites();
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: ['pinpoint'] });
  if (existing.length) await browser.scripting.unregisterContentScripts({ ids: ['pinpoint'] });
  if (matches.length) {
    await browser.scripting.registerContentScripts([
      { id: 'pinpoint', js: [CONTENT_SCRIPT], matches, runAt: 'document_idle' },
    ]);
  }
}

/** Injects the content script into an already open tab (registration only covers new loads). */
export async function injectContentScript(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['/content-scripts/content.js'],
  });
}

/**
 * Makes sure Pinpoint can talk to the page in this tab: asks for the site if needed (only works
 * from a click), then injects the content script if it is not loaded yet. False if refused.
 */
export async function reachPage(tab: { id?: number; url?: string }) {
  if (!tab.id || !sitePattern(tab.url)) return false;
  if (!(await hasSiteAccess(tab.url)) && !(await requestSiteAccess(tab.url))) return false;
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'pinpoint:ping' });
  } catch {
    await injectContentScript(tab.id);
  }
  return true;
}
