import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choiceNote, statusChoices } from './statusChoices.ts';

const targets = (status: string, owner: boolean) =>
  statusChoices(status, owner).map((choice) => choice.status);

test('whoever found the animal says where it stays', () => {
  assert.deepEqual(targets('on_the_way', false), [
    'rescued',
    'fostered',
    'for_adoption',
    'adopted',
  ]);
});

test('only the author marks an open or not found rescue as safe', () => {
  assert.deepEqual(targets('open', false), []);
  assert.deepEqual(targets('not_found', false), []);
  assert.equal(targets('open', true).length, 4);
});

test('a foster can keep the animal or put it up for adoption', () => {
  assert.deepEqual(targets('rescued', false), ['fostered', 'for_adoption', 'adopted']);
  assert.deepEqual(targets('fostered', false), ['for_adoption', 'adopted']);
});

test('pausing an adoption and a return stay with the author', () => {
  assert.deepEqual(targets('for_adoption', false), []);
  assert.deepEqual(targets('for_adoption', true), ['fostered']);
  assert.deepEqual(targets('adopted', true), ['for_adoption']);
});

test('the note says what changed', () => {
  const [pause] = statusChoices('for_adoption', true);
  assert.ok(pause);
  assert.match(choiceNote(pause, 'for_adoption'), /pausada/);
});
