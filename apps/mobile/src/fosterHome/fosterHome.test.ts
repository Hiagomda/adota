import assert from 'node:assert/strict';
import { test } from 'node:test';
import { optionSummary, slotsLabel, stayActions, toggleChoice } from './fosterHome.ts';

test('a casa responde e quem pediu cancela', () => {
  assert.deepEqual(stayActions('requested', 'foster'), ['approve', 'decline']);
  assert.deepEqual(stayActions('requested', 'requester'), ['cancel']);
  assert.deepEqual(stayActions('approved', 'requester'), ['end', 'cancel']);
  assert.deepEqual(stayActions('ended', 'foster'), []);
});

test('mostra as vagas como a pessoa diria', () => {
  assert.equal(slotsLabel(1, 2), '1 vaga livre de 2');
  assert.equal(slotsLabel(3, 3), '3 vagas livres de 3');
  assert.equal(slotsLabel(0, 1), 'Sem vaga agora');
});

test('resume a casa sem endereço', () => {
  assert.equal(
    optionSummary({ distanceKm: 2, freeSlots: 1, capacity: 1, maxDays: 15 }),
    'a cerca de 2 km · 1 vaga livre de 1 · até 15 dias',
  );
  assert.equal(
    optionSummary({ distanceKm: null, freeSlots: 0, capacity: 2, maxDays: null }),
    'Sem vaga agora',
  );
});

test('não deixa a escolha vazia quando precisa de uma', () => {
  assert.deepEqual(toggleChoice(['dog'], 'dog', true), ['dog']);
  assert.deepEqual(toggleChoice(['dog'], 'cat', true), ['dog', 'cat']);
  assert.deepEqual(toggleChoice(['food'], 'food'), []);
});
