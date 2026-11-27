import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedbackItem } from '../src/lib/db.ts';
import { groupFeedback, pageKey, shortPage, sizeLabel } from '../src/features/feedback/organize.ts';

let seq = 0;
const item = (url: string, w: number, x?: number, y?: number) =>
  ({
    sequence_number: ++seq,
    page_url: url,
    viewport_width: w,
    viewport_height: 800,
    element_x: x,
    element_y: y,
  }) as FeedbackItem;

test('groups by page and exact viewport, sorts top-to-bottom then left-to-right', () => {
  const a = item('https://s.test/shop?view=grid#top', 1280, 500, 300);
  const b = item('https://s.test/shop?view=grid', 1280, 20, 310); // same row as a, left of it
  const c = item('https://s.test/shop?view=grid', 1280, 0, 40);
  const d = item('https://s.test/shop?view=grid', 390, 0, 10); // same page, phone size
  const e = item('https://s.test/shop?view=list', 1280, 0, 0); // other query: other page
  const f = item('https://s.test/shop?view=grid', 1280); // no position: last
  const groups = groupFeedback([f, e, d, c, b, a]);
  assert.deepEqual(
    groups.map((g) => [g.page, g.viewport, g.items.map((i) => i.sequence_number)]),
    [
      ['https://s.test/shop?view=grid', '1280×800', [c, b, a, f].map((i) => i.sequence_number)],
      ['https://s.test/shop?view=grid', '390×800', [d.sequence_number]],
      ['https://s.test/shop?view=list', '1280×800', [e.sequence_number]],
    ],
  );
  assert.equal(groups.flatMap((g) => g.items).length, 6, 'grouping never merges comments');
});

test('page keys and size labels', () => {
  assert.equal(pageKey('http://localhost:5173/a?b=1#c'), 'http://localhost:5173/a?b=1');
  assert.equal(pageKey('not a url'), 'not a url');
  assert.equal(shortPage('https://s.test/a/b?c=1'), '/a/b?c=1');
  assert.deepEqual([390, 800, 1440].map(sizeLabel), ['Mobile', 'Tablet', 'Desktop']);
});
