import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Post } from '../types';
import { openHelpRequests } from './helpRequests.ts';

const now = Date.parse('2026-10-16T12:00:00.000Z');
const ask = (id: string, deadline: string | null, status = 'open') =>
  ({
    id,
    status,
    helpRequest: { kind: 'food', goalAmount: null, pixKey: null, deadline },
  }) as unknown as Post;

test('keeps requests without deadline or with a future one, whatever the status', () => {
  const posts = [
    ask('a', null, 'adopted'),
    ask('b', '2026-10-20T00:00:00.000Z'),
    ask('c', '2026-10-01T00:00:00.000Z'),
    { id: 'd', helpRequest: null } as unknown as Post,
  ];
  assert.deepEqual(
    openHelpRequests(posts, now).map((post) => post.id),
    ['a', 'b'],
  );
});
