import assert from 'node:assert/strict';
import test from 'node:test';
import { withDeadline } from './deadline.ts';

test('a server that never answers does not hold the app', async () => {
  const hanging = new Promise<string>(() => undefined);
  const started = Date.now();
  assert.equal(await withDeadline(hanging, 50, null), null);
  assert.ok(Date.now() - started < 500);
});

test('an answer inside the deadline wins', async () => {
  assert.equal(await withDeadline(Promise.resolve('nova'), 1000, null), 'nova');
});

test('a failure inside the deadline reaches the caller', async () => {
  await assert.rejects(withDeadline(Promise.reject(new Error('dns')), 1000, null), /dns/);
});
