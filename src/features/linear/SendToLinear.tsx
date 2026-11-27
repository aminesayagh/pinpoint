import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { FeedbackItem, ReviewSession } from '@/lib/db';
import { useSettings } from '@/lib/settings';
import { titleOf, toSend } from '@/features/feedback/issue';
import { groupFeedback } from '@/features/feedback/organize';
import { getTeamOptions, PRIORITIES } from './api';
import { sendBatch, type BatchResult } from './submit';
import { useDestination } from './useDestination';

type Step =
  | { name: 'idle'; result?: BatchResult }
  | { name: 'preview' }
  | { name: 'sending'; done: number; total: number };

/** One explicit action: preview what will be created, then create the issues. */
export function SendToLinear({
  session,
  items,
}: {
  session: ReviewSession;
  items: FeedbackItem[];
}) {
  const settings = useSettings();
  const destination = useDestination(session.linear_team_id, session.linear_project_id);
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [priority, setPriority] = useState<number>();
  const [labels, setLabels] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  // Reading order: the same groups and order as the list.
  const batch = groupFeedback(toSend(items)).flatMap((g) => g.items);
  const apiKey = settings?.linear_api_key;
  const labelIds = settings?.default_linear_label_ids ?? [];
  const chosenPriority = priority ?? settings?.default_linear_priority ?? 0;

  useEffect(() => {
    if (step.name !== 'preview' || !apiKey || !labelIds.length) return;
    let live = true;
    getTeamOptions(apiKey, session.linear_team_id)
      .then(
        (o) =>
          live && setLabels(o.labels.filter((l) => labelIds.includes(l.id)).map((l) => l.name)),
      )
      .catch(() => {});
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- label ids are read when the preview opens
  }, [step.name, apiKey, session.linear_team_id]);

  async function send() {
    if (!apiKey) return;
    setError(undefined);
    setStep({ name: 'sending', done: 0, total: batch.length });
    try {
      const result = await sendBatch(
        apiKey,
        session,
        batch,
        {
          teamId: session.linear_team_id,
          projectId: session.linear_project_id,
          priority: chosenPriority,
          labelIds,
        },
        (done, total) => setStep({ name: 'sending', done, total }),
      );
      setStep({ name: 'idle', result });
    } catch (e) {
      setError(`Sending stopped: ${(e as Error).message}`);
      setStep({ name: 'idle' });
    }
  }

  if (step.name === 'sending') {
    return (
      <p role="status" className="text-sm">
        Creating issue {Math.min(step.done + 1, step.total)} of {step.total}…
      </p>
    );
  }

  if (step.name === 'preview') {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-default p-3 text-sm">
        <h2 className="font-semibold">
          {batch.length} issue{batch.length > 1 ? 's' : ''} for {destination}
        </h2>
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          {batch.map((i) => (
            <li key={i.id}>{titleOf(i)}</li>
          ))}
        </ol>
        <label className="flex items-center gap-2">
          Priority
          <select
            className="rounded-lg border border-default bg-surface px-2 py-1"
            value={chosenPriority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {labels.length > 0 && <p>Labels: {labels.join(', ')}</p>}
        <div className="flex gap-2">
          <Button size="sm" onPress={() => void send()}>
            Create {batch.length} issue{batch.length > 1 ? 's' : ''}
          </Button>
          <Button size="sm" variant="secondary" onPress={() => setStep({ name: 'idle' })}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  const r = step.result;
  return (
    <section className="flex flex-col gap-2 text-sm">
      {batch.length > 0 &&
        (apiKey ? (
          <Button
            className="self-start"
            variant="secondary"
            onPress={() => setStep({ name: 'preview' })}
          >
            Send {batch.length} to Linear
          </Button>
        ) : (
          <p className="text-muted">Connect Linear in Settings to send these comments.</p>
        ))}
      {r && (
        <p role="status" className={r.failed || r.unknown ? 'text-warning' : 'text-success'}>
          {[
            r.created && `${r.created} issue${r.created > 1 ? 's' : ''} created.`,
            r.failed && `${r.failed} failed.`,
            r.unknown && `${r.unknown} not confirmed.`,
            r.stoppedBy,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
