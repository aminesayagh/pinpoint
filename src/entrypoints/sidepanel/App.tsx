import { useEffect, useState } from 'react';
import logo from '@/assets/logo.svg';
import { LinearSettings } from '@/features/linear/LinearSettings';
import { SiteAccess } from '@/features/linear/SiteAccess';
import { SessionList } from '@/features/sessions/SessionList';
import { SessionView } from '@/features/sessions/SessionView';
import { listSessions, markInterruptedSubmissions } from '@/lib/db';

type View = { name: 'sessions' | 'settings' } | { name: 'session'; id: string };

export default function App() {
  const [view, setView] = useState<View>();

  // Reopening the panel (or the browser) brings back the session in progress.
  useEffect(() => {
    // A send cut short (panel closed, crash) leaves comments "submitting": they become
    // "not confirmed" so they are checked in Linear before any retry.
    void markInterruptedSubmissions().catch(() => {});
    listSessions().then(
      (all) => {
        const active = all.find((s) => s.status === 'active');
        setView(active ? { name: 'session', id: active.id } : { name: 'sessions' });
      },
      () => setView({ name: 'sessions' }),
    );
  }, []);

  const tab = (name: 'sessions' | 'settings', label: string) => (
    <button
      className={`text-sm ${view?.name === name || (name === 'sessions' && view?.name === 'session') ? 'font-semibold' : 'text-muted'}`}
      onClick={() => setView({ name })}
    >
      {label}
    </button>
  );

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-4">
        <h1 className="mr-auto flex items-center gap-2 text-lg font-semibold">
          <img src={logo} alt="" className="size-5" />
          Pinpoint
        </h1>
        {tab('sessions', 'Sessions')}
        {tab('settings', 'Settings')}
      </header>
      {view?.name === 'sessions' && (
        <SessionList
          onOpen={(id) => setView({ name: 'session', id })}
          onSettings={() => setView({ name: 'settings' })}
        />
      )}
      {view?.name === 'session' && (
        <SessionView id={view.id} onBack={() => setView({ name: 'sessions' })} />
      )}
      {view?.name === 'settings' && (
        <>
          <LinearSettings />
          <SiteAccess />
        </>
      )}
    </main>
  );
}
