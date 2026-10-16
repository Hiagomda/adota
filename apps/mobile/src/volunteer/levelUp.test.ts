import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leveledUp, parseSeenFloor } from './levelUp.ts';

test('the first visit records the level without a party', () => {
  assert.equal(leveledUp(null, 100), false);
});

test('a higher floor than the one seen is a level up', () => {
  assert.equal(leveledUp(0, 100), true);
});

test('the same or a lower floor is not', () => {
  assert.equal(leveledUp(100, 100), false);
  assert.equal(leveledUp(250, 100), false);
});

test('a broken stored value counts as never seen', () => {
  assert.equal(parseSeenFloor(null), null);
  assert.equal(parseSeenFloor('abc'), null);
  assert.equal(parseSeenFloor('-5'), null);
  assert.equal(parseSeenFloor('1.5'), null);
  assert.equal(parseSeenFloor('250'), 250);
});
