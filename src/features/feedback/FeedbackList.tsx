import { Button, Input, Label, TextArea, TextField } from '@heroui/react';
import { useState } from 'react';
import { deleteFeedback, updateFeedback, type FeedbackItem } from '@/lib/db';
import { generatedTitle, isLocked, titleOf } from './issue';
import { groupFeedback, shortPage, sizeLabel } from './organize';
import { SavedThumbnail } from './Thumbnail';

type Order = 'page' | 'time';

/** The comments of a session, by page and window size (default) or in the order they were made. */
export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const [order, setOrder] = useState<Order>('page');
  const toggle = (value: Order, label: string) => (
    <button
      type="button"
      aria-pressed={order === value}
      className={order === value ? 'font-semibold' : 'text-muted'}
      onClick={() => setOrder(value)}
    >
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-sm">
        <h2 className="mr-auto font-semibold">Comments ({items.length})</h2>
        {items.length > 1 && (
          <>
            {toggle('page', 'By page')}
            {toggle('time', 'By time')}
          </>
        )}
      </div>
      {!items.length && <p className="text-sm text-muted">No comments yet.</p>}
      {order === 'time' ? (
        <Items items={items} />
      ) : (
        groupFeedback(items).map((g) => (
          <div key={g.key} className="flex flex-col gap-2">
            <h3 className="truncate text-xs text-muted" title={g.page}>
              {shortPage(g.page)} · {sizeLabel(g.items[0]!.viewport_width)} {g.viewport}
            </h3>
            <Items items={g.items} />
          </div>
        ))
      )}
    </section>
  );
}

function Items({ items }: { items: FeedbackItem[] }) {
  const [editing, setEditing] = useState<string>();
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((i) =>
        editing === i.id ? (
          <li key={i.id}>
            <Editor item={i} onDone={() => setEditing(undefined)} />
          </li>
        ) : (
          <li key={i.id} className="flex items-start gap-3">
            {isLocked(i) ? (
              <span className="w-4 shrink-0" />
            ) : (
              <input
                type="checkbox"
                className="mt-3 size-4 shrink-0"
                aria-label={`Send #${i.sequence_number} with the next batch`}
                checked={!i.excluded}
                onChange={(e) => void updateFeedback(i.id, { excluded: !e.target.checked })}
              />
            )}
            <SavedThumbnail feedbackId={i.id} alt={`Screenshot of comment #${i.sequence_number}`} />
            <span className={`min-w-0 ${i.excluded ? 'text-muted' : ''}`}>
              {isLocked(i) ? (
                <>
                  #{i.sequence_number} {titleOf(i)}
                </>
              ) : (
                <button
                  type="button"
                  className="text-left hover:underline"
                  aria-label={`Edit #${i.sequence_number} ${titleOf(i)}`}
                  onClick={() => setEditing(i.id)}
                >
                  #{i.sequence_number} {titleOf(i)}
                </button>
              )}
              {i.linear_issue_url && (
                <>
                  {' · '}
                  <a
                    className="underline"
                    href={i.linear_issue_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {i.linear_issue_identifier}
                  </a>
                </>
              )}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

/** Edit a draft's title and comment, or delete it. Saved on Done. */
function Editor({ item, onDone }: { item: FeedbackItem; onDone: () => void }) {
  const [title, setTitle] = useState(item.title ?? '');
  const [text, setText] = useState(item.description);
  const [error, setError] = useState<string>();
  const run = (action: () => Promise<unknown>) =>
    void action().then(onDone, (e: Error) => setError(`Could not save: ${e.message}`));

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-default p-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          updateFeedback(item.id, { title: title.trim() || undefined, description: text.trim() }),
        );
      }}
    >
      <SavedThumbnail feedbackId={item.id} alt={`Screenshot of comment #${item.sequence_number}`} />
      <TextField value={title} onChange={setTitle}>
        <Label>Issue title</Label>
        <Input placeholder={generatedTitle(text)} />
      </TextField>
      <TextField value={text} onChange={setText} autoFocus>
        <Label>Comment</Label>
        <TextArea rows={4} />
      </TextField>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" isDisabled={!text.trim()}>
          Done
        </Button>
        <Button size="sm" variant="secondary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="danger-soft"
          className="ml-auto"
          onPress={() =>
            confirm(`Delete comment #${item.sequence_number}? It cannot be undone.`) &&
            run(() => deleteFeedback(item.id))
          }
        >
          Delete
        </Button>
      </div>
    </form>
  );
}
