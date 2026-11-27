// Per-site access (MAS-66): Pinpoint asks for one origin at a time, when the reviewer wants it,
// instead of "all websites" at install. Localhost works like any other site.

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

export async function hasSiteAccess(url: string | undefined) {
  const origin = sitePattern(url);
  return !!origin && browser.permissions.contains({ origins: [origin] });
}

/** Must run inside a click handler: Chrome only shows the prompt for a user gesture. */
export async function requestSiteAccess(url: string | undefined) {
  const origin = sitePattern(url);
  return !!origin && browser.permissions.request({ origins: [origin] });
}

export async function removeSiteAccess(url: string | undefined) {
  const origin = sitePattern(url);
  return !!origin && browser.permissions.remove({ origins: [origin] });
}

const LINEAR_HOSTS = ['https://api.linear.app/*', 'https://storage.googleapis.com/*'];
export const CONTENT_SCRIPT = 'content-scripts/content.js';

/** Granted review sites, without the Linear hosts the manifest always holds. */
export async function grantedSites() {
  const { origins = [] } = await browser.permissions.getAll();
  return origins.filter((o) => !LINEAR_HOSTS.includes(o));
}

/** Registers the content script on every granted site so it loads after each navigation. */
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
  await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] });
}
