import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedbackItem } from '../src/lib/db.ts';
import { generatedTitle, titleOf, toSend } from '../src/features/feedback/issue.ts';

test('generated title is the first line, shortened', () => {
  assert.equal(generatedTitle('  Logo is blurry\nOn retina screens'), 'Logo is blurry');
  assert.equal(generatedTitle('x'.repeat(100)).length, 80);
  assert.equal(generatedTitle('   '), 'Untitled comment');
  assert.equal(titleOf({ title: ' ', description: 'Fallback' }), 'Fallback');
  assert.equal(titleOf({ title: 'Mine', description: 'Fallback' }), 'Mine');
});

test('only included drafts and failed items are sent', () => {
  const item = (id: string, s: FeedbackItem['submission_status'], excluded?: boolean) =>
    ({ id, submission_status: s, excluded }) as FeedbackItem;
  const ids = toSend([
    item('draft', 'draft'),
    item('later', 'draft', true),
    item('failed', 'failed'),
    item('sent', 'submitted'),
    item('unsure', 'unknown'),
    item('busy', 'submitting'),
  ]).map((i) => i.id);
  assert.deepEqual(ids, ['draft', 'failed']);
});
