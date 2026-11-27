// From a comment to a Linear issue: no AI, the reviewer's own words.
import type { FeedbackItem } from '@/lib/db';

/** Default title: the first line of the comment, shortened. The reviewer can replace it. */
export function generatedTitle(description: string) {
  const line = description.trim().split('\n')[0]!.trim();
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line || 'Untitled comment';
}

export const titleOf = (i: Pick<FeedbackItem, 'title' | 'description'>) =>
  i.title?.trim() || generatedTitle(i.description);

/** Sent already, or waiting for a check: no longer a draft the reviewer edits. */
export const isLocked = (i: Pick<FeedbackItem, 'submission_status'>) =>
  i.submission_status === 'submitted' ||
  i.submission_status === 'submitting' ||
  i.submission_status === 'unknown';

/** What the next send would create. */
export const toSend = (items: FeedbackItem[]) => items.filter((i) => !isLocked(i) && !i.excluded);
