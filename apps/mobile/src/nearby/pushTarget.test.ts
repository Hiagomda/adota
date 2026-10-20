import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postIdFromPush } from './pushTarget.ts';

const id = '3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b';

test('abre o resgate do postId do push', () => {
  assert.equal(postIdFromPush({ postId: id, url: `egua://post/${id}` }), id);
});

test('usa o link quando não vem postId', () => {
  assert.equal(postIdFromPush({ url: `egua://post/${id}` }), id);
});

test('ignora push sem resgate ou com dado estranho', () => {
  assert.equal(postIdFromPush(undefined), null);
  assert.equal(postIdFromPush({}), null);
  assert.equal(postIdFromPush({ postId: '../settings' }), null);
  assert.equal(postIdFromPush({ url: 'egua://post/../../settings' }), null);
  assert.equal(postIdFromPush({ url: `https://exemplo.com/post/${id}` }), null);
});
