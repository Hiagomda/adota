import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feedPointFreshness } from './feedPoints.ts';

const now = Date.parse('2026-11-12T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

describe('feedPointFreshness', () => {
  it('mostra vazio até alguém abastecer', () => {
    const point = { lastRefilledAt: hoursAgo(5), lastEmptyAt: hoursAgo(1), lastCheckedAt: null };
    assert.equal(feedPointFreshness(point, now).state, 'empty');
    const refilled = { ...point, lastRefilledAt: hoursAgo(0.5) };
    assert.equal(feedPointFreshness(refilled, now).state, 'refilled');
  });

  it('abastecido vale por um dia, depois vira conferido', () => {
    const point = { lastRefilledAt: hoursAgo(30), lastEmptyAt: null, lastCheckedAt: hoursAgo(40) };
    const result = feedPointFreshness(point, now);
    assert.equal(result.state, 'checked');
    assert.equal(result.at, hoursAgo(30));
  });

  it('sem nenhum aviso, não inventa estado', () => {
    const point = { lastRefilledAt: null, lastEmptyAt: null, lastCheckedAt: null };
    assert.deepEqual(feedPointFreshness(point, now), { state: 'unknown', at: null });
  });
});
