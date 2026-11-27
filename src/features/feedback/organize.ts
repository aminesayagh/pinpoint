// How the comment list is organized (MAS-63). Pure functions, so they are unit tested.
import type { FeedbackItem } from '@/lib/db';

/**
 * Comments on the same page belong together. The query string is kept (it often changes what is
 * shown: ?view=calendar), the #fragment is dropped (same page, other scroll position). A
 * client-side route change updates the URL, so each route is its own page.
 */
export function pageKey(url: string) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/** The page as a reader names it: path and query, without the origin. */
export function shortPage(page: string) {
  try {
    const u = new URL(page);
    return `${u.pathname}${u.search}`;
  } catch {
    return page;
  }
}

export function sizeLabel(width: number) {
  return width < 768 ? 'Mobile' : width < 1024 ? 'Tablet' : 'Desktop';
}

const ROW = 16; // px: comments this close vertically are on the same row, read left to right

/** Top to bottom, then left to right within a row. Items without a position go last, by number. */
export function byPosition<
  T extends Pick<FeedbackItem, 'element_x' | 'element_y' | 'sequence_number'>,
>(items: T[]) {
  const placed = items
    .filter((i) => i.element_y !== undefined)
    .sort((a, b) => a.element_y! - b.element_y!);
  const rows: T[][] = [];
  for (const item of placed) {
    const row = rows.at(-1);
    if (row && item.element_y! - row[0]!.element_y! <= ROW) row.push(item);
    else rows.push([item]);
  }
  const unplaced = items
    .filter((i) => i.element_y === undefined)
    .sort((a, b) => a.sequence_number - b.sequence_number);
  return [
    ...rows.flatMap((r) => r.sort((a, b) => (a.element_x ?? 0) - (b.element_x ?? 0))),
    ...unplaced,
  ];
}

export interface Group<T> {
  key: string;
  page: string;
  viewport: string;
  items: T[];
}

/** One group per page and exact window size, in the order they were first commented. */
export function groupFeedback<T extends FeedbackItem>(items: T[]): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  for (const item of [...items].sort((a, b) => a.sequence_number - b.sequence_number)) {
    const page = pageKey(item.page_url);
    const viewport = `${item.viewport_width}×${item.viewport_height}`;
    const key = `${page} ${viewport}`;
    const g = groups.get(key) ?? { key, page, viewport, items: [] };
    g.items.push(item);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, items: byPosition(g.items) }));
}
