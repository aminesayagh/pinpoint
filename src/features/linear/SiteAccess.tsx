import { CircleXmark } from '@gravity-ui/icons';
import { Button, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import {
  hasSiteAccess,
  injectContentScript,
  removeSiteAccess,
  requestSiteAccess,
  sitePattern,
} from '@/lib/sites';
import { useActiveTab } from '@/lib/useActiveTab';

/** Shows whether Pinpoint may review the current tab's site, and asks for it. */
export function SiteAccess() {
  const tab = useActiveTab();
  const [allowed, setAllowed] = useState<boolean>();
  const [error, setError] = useState<string>();
  const site = sitePattern(tab?.url);

  useEffect(() => {
    let live = true;
    const check = () => void hasSiteAccess(tab?.url).then((a) => live && setAllowed(a));
    check();
    browser.permissions.onAdded.addListener(check);
    browser.permissions.onRemoved.addListener(check);
    return () => {
      live = false;
      browser.permissions.onAdded.removeListener(check);
      browser.permissions.onRemoved.removeListener(check);
    };
  }, [tab?.url]);

  async function allow() {
    setError(undefined);
    try {
      if ((await requestSiteAccess(tab?.url)) && tab?.id) await injectContentScript(tab.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const host = site?.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">This site</h2>
      {!site ? (
        <p className="text-sm text-muted">Open a website (http or https) to review it.</p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            <strong>{host}</strong>: {allowed ? 'Pinpoint can review it' : 'not allowed yet'}
          </p>
          {allowed ? (
            <Tooltip delay={300}>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`Remove access to ${host}`}
                onPress={() => void removeSiteAccess(tab?.url)}
              >
                <CircleXmark />
              </Button>
              <Tooltip.Content>Remove access to {host}</Tooltip.Content>
            </Tooltip>
          ) : (
            <Button size="sm" onPress={() => void allow()}>
              Allow
            </Button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}
