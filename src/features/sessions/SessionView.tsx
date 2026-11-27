import { Button, Input, Label, TextField } from '@heroui/react';
import { useEffect, useState } from 'react';
import {
  deleteSession,
  getSession,
  listFeedback,
  renameSession,
  setSessionStatus,
  type SessionStatus,
} from '@/lib/db';
import { useLive } from '@/lib/useLive';
import { useDestination } from '@/features/linear/useDestination';
import { FeedbackList } from '@/features/feedback/FeedbackList';
import { Capture } from '@/features/selection/Capture';
import { sessionName, STATUS_LABEL } from './SessionList';

const STATUS_HELP: Record<SessionStatus, string> = {
  active: 'Review mode is on. Browse normally; comments you add are saved to this session.',
  paused: 'Review mode is paused. Nothing is captured until you resume.',
  completed: 'This session is ended. Its comments and Linear links stay here.',
};

export function SessionView({ id, onBack }: { id: string; onBack: () => void }) {
  const session = useLive(() => getSession(id), id);
  const items = useLive(() => listFeedback(id), id);
  const s = session.value;
  const destination = useDestination(s?.linear_team_id, s?.linear_project_id);
  const [error, setError] = useState<string>();
  const [name, setName] = useState<string>();

  // The session was deleted (here or in another window): go back to the list.
  const gone = !session.error && session.value === undefined && items.value !== undefined;
  useEffect(() => {
    if (gone) onBack();
  }, [gone, onBack]);
  if (!s)
    return session.error ? <p className="text-sm text-danger">{session.error.message}</p> : null;

  const run = (action: () => Promise<unknown>) => () =>
    void action().then(
      () => setError(undefined),
      (e: Error) => setError(`Could not save: ${e.message}`),
    );

  const unsent = items.value?.filter((i) => i.submission_status !== 'submitted').length ?? 0;
  const remove = run(async () => {
    const what = unsent
      ? `${unsent} comment${unsent > 1 ? 's' : ''} not sent to Linear will be lost.`
      : 'All its comments were sent to Linear.';
    if (!confirm(`Delete "${sessionName(s)}"? ${what} Issues already in Linear are not affected.`))
      return;
    await deleteSession(id);
    onBack();
  });

  return (
    <div className="flex flex-col gap-4">
      <button className="self-start text-sm underline" onClick={onBack}>
        ← All sessions
      </button>
      <TextField
        value={name ?? s.name ?? ''}
        onChange={setName}
        onBlur={run(async () => name !== undefined && (await renameSession(id, name.trim())))}
      >
        <Label>Session name</Label>
        <Input placeholder={sessionName(s)} />
      </TextField>
      <div className="flex flex-col gap-1 text-sm">
        <p>
          <strong>{STATUS_LABEL[s.status]}</strong> · issues go to {destination}
        </p>
        <p className="text-muted">{STATUS_HELP[s.status]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {s.status === 'active' && (
          <Button size="sm" variant="secondary" onPress={run(() => setSessionStatus(id, 'paused'))}>
            Pause review
          </Button>
        )}
        {s.status === 'paused' && (
          <Button size="sm" onPress={run(() => setSessionStatus(id, 'active'))}>
            Resume review
          </Button>
        )}
        {s.status !== 'completed' ? (
          <Button
            size="sm"
            variant="secondary"
            onPress={run(() => setSessionStatus(id, 'completed'))}
          >
            End session
          </Button>
        ) : (
          <Button size="sm" onPress={run(() => setSessionStatus(id, 'active'))}>
            Reopen
          </Button>
        )}
        <Button size="sm" variant="danger-soft" onPress={remove}>
          Delete session
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {s.status === 'active' && <Capture sessionId={id} />}
      {items.value && <FeedbackList items={items.value} />}
    </div>
  );
}
