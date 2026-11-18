import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clusterPoints } from './clusters.ts';

// Três animais no mesmo quarteirão de Nazaré e um em Castanhal.
const points = [
  { id: 'a', latitude: -1.4523, longitude: -48.4832 },
  { id: 'b', latitude: -1.4526, longitude: -48.4835 },
  { id: 'c', latitude: -1.4529, longitude: -48.4829 },
  { id: 'd', latitude: -1.2964, longitude: -47.9262 },
];

describe('agrupamento de patas no navegador', () => {
  it('afastado, junta os vizinhos num grupo com o número e deixa o distante sozinho', () => {
    const items = clusterPoints(points, 11);
    const group = items.find((item) => item.kind === 'group');
    assert.ok(group && group.kind === 'group');
    assert.equal(group.count, 3);
    assert.ok(group.bounds.west <= -48.4835 && group.bounds.east >= -48.4829);
    assert.equal(items.filter((item) => item.kind === 'single').length, 1);
  });

  it('aproximado, solta todos os animais', () => {
    const items = clusterPoints(points, 15);
    assert.equal(items.length, 4);
    assert.ok(items.every((item) => item.kind === 'single'));
  });

  it('o animal escolhido nunca some dentro de um grupo', () => {
    const items = clusterPoints(points, 11, { keepSingle: 'b' });
    assert.ok(items.some((item) => item.kind === 'single' && item.item.id === 'b'));
    const group = items.find((item) => item.kind === 'group');
    assert.ok(group && group.kind === 'group' && group.count === 2);
  });
});
