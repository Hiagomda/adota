import assert from 'node:assert/strict';
import test from 'node:test';
import { lastRequestLabel, recordRequest, requestPath } from './timings.ts';

test('request path drops the query string', () => {
  assert.equal(requestPath('http://api.example/posts?limit=20'), '/posts');
});

test('last request label uses the newest sample', () => {
  recordRequest({ method: 'GET', path: '/posts', status: 200, ms: 120, bytes: 6400 });
  assert.match(lastRequestLabel(), /GET \/posts · 120 ms · 6400 B/);
});
