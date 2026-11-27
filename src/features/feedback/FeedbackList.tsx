import { useState } from 'react';
import type { FeedbackItem } from '@/lib/db';
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
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-3">
          <SavedThumbnail feedbackId={i.id} alt={`Screenshot of comment #${i.sequence_number}`} />
          <span className="min-w-0">
            #{i.sequence_number} {i.title || i.description}
            {i.linear_issue_url && (
              <>
                {' · '}
                <a className="underline" href={i.linear_issue_url} target="_blank" rel="noreferrer">
                  {i.linear_issue_identifier}
                </a>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
