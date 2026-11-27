import { Gear } from '@gravity-ui/icons';
import { Button, ButtonGroup, Input, Label, TextField, Tooltip } from '@heroui/react';
import { useState } from 'react';
import { createSession, feedbackCounts, listSessions, type ReviewSession } from '@/lib/db';
import { useSettings } from '@/lib/settings';
import { useLive } from '@/lib/useLive';
import { useDestination } from '@/features/linear/useDestination';

export const STATUS_LABEL: Record<ReviewSession['status'], string> = {
  active: 'Reviewing',
  paused: 'Paused',
  completed: 'Ended',
};

export function sessionName(s: ReviewSession) {
  return s.name || `Review of ${new Date(s.created_at).toLocaleString()}`;
}

export function SessionList({
  onOpen,
  onSettings,
}: {
  onOpen: (id: string) => void;
  onSettings: () => void;
}) {
  const sessions = useLive(listSessions);
  const counts = useLive(feedbackCounts).value;
  const open = sessions.value?.filter((s) => s.status !== 'completed') ?? [];
  const ended = sessions.value?.filter((s) => s.status === 'completed') ?? [];

  return (
    <div className="flex flex-col gap-6">
      <NewSession onCreated={onOpen} onSettings={onSettings} />
      {sessions.error && (
        <p className="text-sm text-danger">
          Could not read saved sessions: {sessions.error.message}
        </p>
      )}
      <Group title="In progress" sessions={open} counts={counts} onOpen={onOpen} />
      <Group title="Ended" sessions={ended} counts={counts} onOpen={onOpen} />
    </div>
  );
}

function Group({
  title,
  sessions,
  counts,
  onOpen,
}: {
  title: string;
  sessions: ReviewSession[];
  counts?: Map<string, { total: number; submitted: number }>;
  onOpen: (id: string) => void;
}) {
  if (!sessions.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col divide-y divide-default rounded-lg border border-default">
        {sessions.map((s) => {
          const c = counts?.get(s.id);
          return (
            <li key={s.id}>
              <button
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-default/40"
                onClick={() => onOpen(s.id)}
              >
                <span className="text-sm font-medium">{sessionName(s)}</span>
                <span className="text-xs text-muted">
                  {STATUS_LABEL[s.status]} · {c?.total ?? 0} comments
                  {c?.submitted ? ` · ${c.submitted} sent to Linear` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewSession({
  onCreated,
  onSettings,
}: {
  onCreated: (id: string) => void;
  onSettings: () => void;
}) {
  const settings = useSettings();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const teamId = settings?.default_linear_team_id;
  const projectId = settings?.default_linear_project_id;
  const destination = useDestination(teamId, projectId);

  if (!settings) return null;
  if (!settings.linear_api_key || !teamId) {
    return (
      <section className="flex flex-col items-start gap-2">
        <p className="text-sm">Connect Linear and choose a team before starting a review.</p>
        <Button size="sm" onPress={onSettings}>
          Open settings
        </Button>
      </section>
    );
  }

  async function start() {
    try {
      const s = await createSession({
        name: name.trim() || undefined,
        linear_team_id: teamId!,
        linear_project_id: projectId,
      });
      onCreated(s.id);
    } catch (e) {
      setError(`Could not save the session: ${(e as Error).message}`);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <TextField value={name} onChange={setName}>
        <Label>New review session</Label>
        <Input placeholder="Name (optional), e.g. Checkout on mobile" />
      </TextField>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ButtonGroup className="self-start">
        <Button type="submit">Start session</Button>
        <Tooltip delay={300}>
          <Button
            isIconOnly
            aria-label={`Change destination (now ${destination})`}
            onPress={onSettings}
          >
            <ButtonGroup.Separator />
            <Gear />
          </Button>
          <Tooltip.Content>Change destination · now {destination}</Tooltip.Content>
        </Tooltip>
      </ButtonGroup>
    </form>
  );
}
