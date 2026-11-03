import assert from 'node:assert/strict';
import test from 'node:test';
import {
  afterFailure,
  newRecordId,
  pendingLine,
  recordsFor,
  stampOfflineNote,
  type PendingRecord,
} from './pendingRecords.ts';

test('offline and session problems wait; server errors retry a few times', () => {
  assert.equal(afterFailure('offline', 9), 'keep');
  assert.equal(afterFailure('session', 0), 'keep');
  assert.equal(afterFailure('server', 0), 'retry');
  assert.equal(afterFailure('server', 4), 'give_up');
  assert.equal(afterFailure('rejected', 0), 'give_up');
});

test('the record id doubles as a valid client key', () => {
  const id = newRecordId(1_800_000_000_000, () => 0.5);
  assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
});

test('a note sent much later keeps the time it was written', () => {
  const written = new Date(2026, 10, 3, 14, 32).toISOString();
  const soon = new Date(2026, 10, 3, 14, 40);
  const later = new Date(2026, 10, 3, 16, 0);
  assert.equal(stampOfflineNote('Comeu bem.', written, soon), 'Comeu bem.');
  assert.equal(
    stampOfflineNote('Comeu bem.', written, later),
    'Comeu bem.\n(anotado às 14:32, sem internet)',
  );
  assert.equal(
    pendingLine({ label: 'Nota no diário', createdAt: written }),
    'Nota no diário · guardado às 14:32',
  );
});

test('records of one rescue come oldest first', () => {
  const base = { kind: 'diary' as const, token: 't', attempts: 0, label: 'x', body: {} };
  const records: PendingRecord[] = [
    { ...base, id: 'b', postId: 'p', createdAt: '2026-11-03T12:00:00Z' },
    { ...base, id: 'c', postId: 'q', createdAt: '2026-11-03T10:00:00Z' },
    { ...base, id: 'a', postId: 'p', createdAt: '2026-11-03T11:00:00Z' },
  ];
  assert.deepEqual(
    recordsFor(records, 'p').map((record) => record.id),
    ['a', 'b'],
  );
});
