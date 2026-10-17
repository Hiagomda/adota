import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergePaws } from './knownPaws.ts';

type Paw = { id: string; open: boolean };
const keep = (paw: Paw) => paw.open;
const ids = (map: Map<string, Paw>) => [...map.keys()];

test('mantém as patas da área anterior quando a nova chega', () => {
  const first = mergePaws(new Map(), [{ id: 'a', open: true }], keep);
  const second = mergePaws(first, [{ id: 'b', open: true }], keep);
  assert.deepEqual(ids(second), ['a', 'b']);
});

test('tira a pata que a API devolve fora do mapa', () => {
  const first = mergePaws(new Map(), [{ id: 'a', open: true }], keep);
  const second = mergePaws(first, [{ id: 'a', open: false }], keep);
  assert.deepEqual(ids(second), []);
});

test('passando do teto, as mais antigas saem primeiro', () => {
  const first = mergePaws(
    new Map(),
    [
      { id: 'a', open: true },
      { id: 'b', open: true },
    ],
    keep,
    2,
  );
  const second = mergePaws(first, [{ id: 'c', open: true }], keep, 2);
  assert.deepEqual(ids(second), ['b', 'c']);
});

test('não muda o Map anterior', () => {
  const first = mergePaws(new Map(), [{ id: 'a', open: true }], keep);
  mergePaws(first, [{ id: 'b', open: true }], keep);
  assert.deepEqual(ids(first), ['a']);
});
