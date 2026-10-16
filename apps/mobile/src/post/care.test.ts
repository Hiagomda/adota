import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageBandOf, careChips } from './care.ts';

test('shows a yes as the fact and a no as a neutral note', () => {
  assert.deepEqual(
    careChips({ neutered: true, vaccinated: false, goodWithKids: null }).map((chip) => [
      chip.label,
      chip.yes,
    ]),
    [
      ['Castrado', true],
      ['Vacinas pendentes', false],
    ],
  );
});

test('nothing filled shows nothing', () => {
  assert.deepEqual(careChips(undefined), []);
  assert.deepEqual(careChips({}), []);
});

test('reads the age band from stored text', () => {
  assert.equal(ageBandOf('filhote'), 'filhote');
  assert.equal(ageBandOf('Adulto'), 'adulto');
  assert.equal(ageBandOf('uns 3 anos'), null);
  assert.equal(ageBandOf(null), null);
});
