import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { waitingLabel, waitingShort } from './waiting.ts';

const now = new Date('2026-10-19T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe('tempo de espera', () => {
  it('fica quieto na primeira semana', () => {
    assert.equal(waitingLabel(daysAgo(3), now), null);
    assert.equal(waitingLabel(null, now), null);
  });

  it('conta em semanas e depois em meses', () => {
    assert.equal(waitingLabel(daysAgo(8), now), 'Esperando há 1 semana');
    assert.equal(waitingLabel(daysAgo(30), now), 'Esperando há 4 semanas');
    assert.equal(waitingLabel(daysAgo(95), now), 'Esperando há 3 meses');
    assert.equal(waitingShort(daysAgo(30), now), 'Há 4 semanas');
  });
});
