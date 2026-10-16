import assert from 'node:assert/strict';
import { test } from 'node:test';
import { journeyOf } from './journey.ts';

test('a new rescue is on the first of six steps', () => {
  const journey = journeyOf('rescue_alert', 'open');
  assert.equal(journey?.current, 0);
  assert.equal(journey?.steps.length, 6);
  assert.equal(journey?.next, 'on_the_way');
});

test('not found stays on the on the way step', () => {
  const journey = journeyOf('rescue_alert', 'not_found');
  assert.equal(journey?.current, 1);
  assert.equal(journey?.notFound, true);
});

test('an adoption post only walks the end of the path', () => {
  const journey = journeyOf('adoption', 'for_adoption');
  assert.deepEqual(journey?.steps, ['for_adoption', 'adopted']);
  assert.equal(journeyOf('adoption', 'adopted')?.next, null);
});

test('lost pets and help requests have no journey', () => {
  assert.equal(journeyOf('lost', 'open'), null);
  assert.equal(journeyOf('help_request', 'open'), null);
});
