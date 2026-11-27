import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as db from '../src/lib/db.ts';
import { sendBatch } from '../src/features/linear/submit.ts';

/** A fake Linear: answers by operation; `create` decides what issueCreate does per call. */
function fakeLinear(create: (n: number) => Response | Error) {
  const calls: { url: string; body?: string }[] = [];
  let creates = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, body });
    if (url.startsWith('https://storage.test/')) return new Response(null, { status: 200 });
    if (body?.includes('fileUpload')) {
      return Response.json({
        data: {
          fileUpload: {
            success: true,
            uploadFile: {
              uploadUrl: 'https://storage.test/put',
              assetUrl: 'https://uploads.linear.app/shot.png',
              headers: [{ key: 'x-goog-meta', value: '1' }],
            },
          },
        },
      });
    }
    const r = create(++creates);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const ok = (n: number) =>
  Response.json({
    data: {
      issueCreate: {
        success: true,
        issue: { id: `id${n}`, identifier: `MAS-${n}`, url: `https://linear.app/i/MAS-${n}` },
      },
    },
  });

async function session(n: number) {
  const s = await db.createSession({ name: 'Shop review', linear_team_id: 'team' });
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push(
      await db.addFeedback(
        {
          session_id: s.id,
          description: `Problem ${i + 1}`,
          page_url: 'https://shop.test/a',
          viewport_width: 1280,
          viewport_height: 800,
          element_selector: 'main > button',
        },
        { image_blob: new Blob(['png']), mime_type: 'image/png', width: 1, height: 1 },
      ),
    );
  }
  return { s, items };
}

test('each comment becomes one issue, with its screenshot and context', async () => {
  const { s, items } = await session(2);
  const linear = fakeLinear(ok);
  const r = await sendBatch(
    'key',
    s,
    items,
    { teamId: 'team', projectId: 'proj', priority: 3 },
    undefined,
    linear.fetchImpl,
  );
  assert.deepEqual(r, { created: 2, failed: 0, unknown: 0 });
  const saved = await db.listFeedback(s.id);
  assert.deepEqual(
    saved.map((i) => [i.submission_status, i.linear_issue_identifier]),
    [
      ['submitted', 'MAS-1'],
      ['submitted', 'MAS-2'],
    ],
  );
  const create = JSON.parse(linear.calls.find((c) => c.body?.includes('issueCreate'))!.body!);
  assert.equal(create.variables.input.id, items[0]!.id, 'the comment id is the issue id');
  assert.equal(create.variables.input.title, 'Problem 1');
  assert.equal(create.variables.input.projectId, 'proj');
  assert.equal(create.variables.input.priority, 3);
  const text: string = create.variables.input.description;
  assert.ok(
    text.startsWith(
      'Problem 1\n\n![Screenshot of the element](https://uploads.linear.app/shot.png)',
    ),
  );
  assert.match(
    text,
    /\+\+\+ Technical context[\s\S]*`main > button`[\s\S]*Shop review, comment #1[\s\S]*\+\+\+$/,
  );
});

test('refused, unclear and auth outcomes are kept apart', async () => {
  const { s, items } = await session(4);
  const linear = fakeLinear((n) =>
    n === 1
      ? Response.json({ errors: [{ message: 'Title too long' }] }, { status: 400 })
      : n === 2
        ? new TypeError('Failed to fetch')
        : Response.json(
            { errors: [{ message: 'x', extensions: { code: 'AUTHENTICATION_ERROR' } }] },
            { status: 401 },
          ),
  );
  const r = await sendBatch('key', s, items, { teamId: 'team' }, undefined, linear.fetchImpl);
  assert.equal(r.failed, 2);
  assert.equal(r.unknown, 1);
  assert.match(r.stoppedBy!, /API key/);
  const saved = await db.listFeedback(s.id);
  assert.deepEqual(
    saved.map((i) => i.submission_status),
    ['failed', 'unknown', 'failed', 'draft'],
  );
  assert.equal(saved[0]!.last_submission_error, 'Title too long');
});
