import assert from 'node:assert/strict';
import test from 'node:test';
import { currentStep, finishOutcome, mapsUrl, stepIndex, teamLine } from './operation.ts';

const op = (fields: Partial<NonNullable<Parameters<typeof currentStep>[0]>['operation']> = {}) => ({
  departedAt: null,
  arrivedAt: null,
  finishedAt: null,
  outcome: null,
  summary: null,
  ...fields,
});

test('the steps follow what the person already did', () => {
  assert.equal(currentStep({ status: 'on_the_way', operation: null }), 'depart');
  assert.equal(currentStep({ status: 'on_the_way', operation: op({ departedAt: 'x' }) }), 'arrive');
  assert.equal(
    currentStep({ status: 'on_the_way', operation: op({ departedAt: 'x', arrivedAt: 'y' }) }),
    'found',
  );
  assert.equal(currentStep({ status: 'rescued', operation: op({ arrivedAt: 'y' }) }), 'summary');
  assert.equal(currentStep({ status: 'on_the_way', operation: op() }, 'not_found'), 'summary');
  assert.equal(currentStep({ status: 'rescued', operation: op({ finishedAt: 'z' }) }), 'done');
  assert.equal(stepIndex('found'), 2);
  assert.equal(stepIndex('done'), 4);
});

test('the summary carries how it ended', () => {
  assert.equal(finishOutcome({ status: 'rescued' }, null), 'found');
  assert.equal(finishOutcome({ status: 'on_the_way' }, 'could_not'), 'could_not');
});

test('the team line says who else is going', () => {
  assert.equal(teamLine([]), null);
  assert.equal(
    teamLine([
      { name: 'Ana', departedAt: 'x', arrivedAt: 'y' },
      { name: 'Rui', departedAt: 'x', arrivedAt: null },
      { name: 'Bia', departedAt: null, arrivedAt: null },
      { name: 'Léo', departedAt: null, arrivedAt: null },
    ]),
    'Ana já chegou, Rui está indo, Bia disse que vai e mais 1',
  );
});

test('the maps link points at the exact spot', () => {
  assert.equal(
    mapsUrl(-1.4523412, -48.4832198),
    'https://www.google.com/maps/search/?api=1&query=-1.452341,-48.483220',
  );
});
