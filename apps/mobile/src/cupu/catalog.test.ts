import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { levelUnlocks, type CupuClosetItem } from './catalog.ts';

const item = (name: string, requiredLevel: string | null): CupuClosetItem => ({
  slot: 'pose',
  code: name,
  name,
  unlocked: true,
  requirement: '',
  requiredLevel,
});

const items = [
  item('Sentadinho', null),
  item('Festeiro', 'local_guardian'),
  item('Guardião', 'active_protector'),
  item('Papo bom', 'guardian_angel'),
];

describe('cupu level unlocks', () => {
  it('lists what the new level opened', () => {
    assert.deepEqual(levelUnlocks(items, 0, 101), ['Festeiro']);
  });

  it('counts every level skipped on the way', () => {
    assert.deepEqual(levelUnlocks(items, 0, 2001), ['Festeiro', 'Guardião', 'Papo bom']);
  });

  it('opens nothing without a level change or from an old server', () => {
    assert.deepEqual(levelUnlocks(items, 101, 101), []);
    assert.deepEqual(levelUnlocks([{ ...items[1]!, requiredLevel: undefined }], 0, 101), []);
  });
});
