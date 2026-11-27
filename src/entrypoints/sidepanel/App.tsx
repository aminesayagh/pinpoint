import { useEffect, useState } from 'react';
import { LinearSettings } from '@/features/linear/LinearSettings';
import { SiteAccess } from '@/features/linear/SiteAccess';
import { SessionList } from '@/features/sessions/SessionList';
import { SessionView } from '@/features/sessions/SessionView';
import { listSessions } from '@/lib/db';

type View = { name: 'sessions' | 'settings' } | { name: 'session'; id: string };

export default function App() {
  const [view, setView] = useState<View>();

  // Reopening the panel (or the browser) brings back the session in progress.
  useEffect(() => {
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
        <h1 className="mr-auto text-lg font-semibold">Pinpoint</h1>
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
