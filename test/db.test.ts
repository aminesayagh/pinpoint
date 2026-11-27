import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as db from '../src/lib/db.ts';

const page = { page_url: 'https://example.com/a', viewport_width: 1280, viewport_height: 800 };
const shot = () => ({
  image_blob: new Blob(['png']),
  mime_type: 'image/png',
  width: 10,
  height: 10,
});

test('session lifecycle, feedback order, screenshots and cascade delete', async () => {
  const s1 = await db.createSession({ name: 'One', linear_team_id: 't' });
  const s2 = await db.createSession({ linear_team_id: 't' });
  assert.equal(
    (await db.getSession(s1.id))?.status,
    'paused',
    'starting a session pauses the other',
  );
  assert.equal((await db.getSession(s2.id))?.status, 'active');

  const a = await db.addFeedback({ ...page, session_id: s1.id, description: 'first' }, shot());
  const b = await db.addFeedback({ ...page, session_id: s1.id, description: 'page-level' });
  await db.addFeedback({ ...page, session_id: s2.id, description: 'other session' }, shot());
  assert.deepEqual(
    (await db.listFeedback(s1.id)).map((i) => i.sequence_number),
    [1, 2],
  );
  assert.equal(b.element_selector, undefined);
  assert.equal((await db.getScreenshot(a.id))?.mime_type, 'image/png');
  assert.equal(await db.getScreenshot(b.id), undefined);

  await db.updateFeedback(a.id, { description: 'edited', submission_status: 'unknown' });
  assert.equal((await db.listFeedback(s1.id))[0]?.submission_status, 'unknown');

  await db.deleteFeedback(b.id);
  const c = await db.addFeedback({ ...page, session_id: s1.id, description: 'later' });
  assert.equal(c.sequence_number, 2, 'sequence continues after the highest one');

  await db.deleteSession(s1.id);
  assert.equal(await db.getSession(s1.id), undefined);
  assert.deepEqual(await db.listFeedback(s1.id), []);
  assert.equal(await db.getScreenshot(a.id), undefined);
  assert.equal((await db.listFeedback(s2.id)).length, 1, 'other sessions untouched');
});
