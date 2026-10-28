import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextTipIndex, tipHidden, tipIndexForDay, tipsFor, TIP_SNOOZE_MS } from './tips.ts';

describe('cupu tips', () => {
  it('has unique ids across every screen', () => {
    const ids = (['adoption', 'fairs', 'network'] as const).flatMap((context) =>
      tipsFor(context).map((tip) => tip.id),
    );
    assert.equal(new Set(ids).size, ids.length);
  });

  it('keeps the same tip for the whole day and changes on the next', () => {
    const morning = new Date('2026-10-28T08:00:00Z');
    const evening = new Date('2026-10-28T20:00:00Z');
    const tomorrow = new Date('2026-10-29T08:00:00Z');
    assert.equal(tipIndexForDay('adoption', morning), tipIndexForDay('adoption', evening));
    assert.notEqual(tipIndexForDay('adoption', morning), tipIndexForDay('adoption', tomorrow));
  });

  it('cycles through the tips', () => {
    assert.equal(nextTipIndex(0, 3), 1);
    assert.equal(nextTipIndex(2, 3), 0);
    assert.equal(nextTipIndex(0, 0), 0);
  });

  it('hides a tip only until the snooze ends', () => {
    const now = 1_000_000;
    assert.equal(tipHidden(null, now), false);
    assert.equal(tipHidden('lixo', now), false);
    assert.equal(tipHidden(String(now + TIP_SNOOZE_MS), now), true);
    assert.equal(tipHidden(String(now - 1), now), false);
  });
});
