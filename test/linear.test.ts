import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gql, LinearError } from '../src/features/linear/api.ts';
import { sitePattern } from '../src/lib/sites.ts';

const answer = (status: number, body: unknown) => (async () =>
  new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const kindOf = (fetchImpl: typeof fetch) =>
  gql('key', 'query { viewer { id } }', {}, fetchImpl).then(
    () => 'ok',
    (e: LinearError) => e.kind,
  );

test('gql sorts failures by what they mean for a write', async () => {
  assert.equal(await kindOf(answer(200, { data: { viewer: { id: '1' } } })), 'ok');
  assert.equal(await kindOf(answer(401, {})), 'auth');
  assert.equal(
    await kindOf(answer(400, { errors: [{ message: 'x', extensions: { type: 'authentication error' } }] })),
    'auth',
  );
  assert.equal(await kindOf(answer(400, { errors: [{ message: 'Invalid team' }] })), 'rejected');
  assert.equal(await kindOf(answer(503, { errors: [{ message: 'busy' }] })), 'server');
  const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
  assert.equal(await kindOf(offline), 'network');
});

test('sitePattern covers the whole host, any port, http(s) only', () => {
  assert.equal(sitePattern('http://localhost:5173/a?b#c'), 'http://localhost/*');
  assert.equal(sitePattern('https://staging.example.com/x'), 'https://staging.example.com/*');
  assert.equal(sitePattern('chrome://extensions'), undefined);
  assert.equal(sitePattern(undefined), undefined);
});
