import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeFilterCount, adoptionQuery, noAdoptionFilters } from './adoptionQuery.ts';

test('with nothing picked it lists every animal for adoption', () => {
  assert.equal(adoptionQuery(noAdoptionFilters), '?status=for_adoption&limit=20');
  assert.equal(activeFilterCount(noAdoptionFilters), 0);
});

test('turns each pick into a filter', () => {
  const filters = {
    species: 'cat' as const,
    age: 'filhote' as const,
    care: ['neutered' as const, 'goodWithKids' as const],
    place: ' Marco ',
  };
  assert.equal(
    adoptionQuery(filters, 'abc'),
    '?status=for_adoption&limit=20&species=cat&age=filhote&neutered=true&goodWithKids=true&place=Marco&cursor=abc',
  );
  assert.equal(activeFilterCount(filters), 5);
});

test('a one-letter neighborhood does not filter yet', () => {
  assert.equal(adoptionQuery({ care: [], place: 'M' }), '?status=for_adoption&limit=20');
});

test('the Adotados tab lists adopted animals with the same filters', () => {
  assert.equal(
    adoptionQuery({ species: 'dog', care: [], place: '' }, undefined, 'adopted'),
    '?status=adopted&limit=20&species=dog',
  );
});
