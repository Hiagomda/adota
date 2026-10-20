import assert from 'node:assert/strict';
import { test } from 'node:test';
import { duplicateSearch, likelyDuplicates } from './nearbyDuplicates.ts';

const now = new Date('2026-10-20T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const post = (id: string, status: string, hours: number, species = 'dog') => ({
  id,
  status,
  createdAt: hoursAgo(hours),
  animal: { species } as never,
});

test('mostra só resgate ainda na rua e recente', () => {
  const found = likelyDuplicates(
    [
      post('aberto', 'open', 2),
      post('a-caminho', 'on_the_way', 10),
      post('resgatado', 'rescued', 1),
      post('antigo', 'open', 100),
      post('nao-achado', 'not_found', 30),
    ],
    'dog',
    now,
  );
  assert.deepEqual(
    found.map((item) => item.id),
    ['aberto', 'a-caminho', 'nao-achado'],
  );
});

test('a mesma espécie vem primeiro e mostra no máximo três', () => {
  const found = likelyDuplicates(
    [
      post('gato-novo', 'open', 1, 'cat'),
      post('cao-1', 'open', 5),
      post('cao-2', 'open', 3),
      post('cao-3', 'open', 8),
    ],
    'dog',
    now,
  );
  assert.deepEqual(
    found.map((item) => item.id),
    ['cao-2', 'cao-1', 'cao-3'],
  );
});

test('busca arredondada perto do ponto, só alertas de resgate', () => {
  assert.equal(
    duplicateSearch({ latitude: -1.452341, longitude: -48.483219 }),
    '?latitude=-1.452&longitude=-48.483&radiusKm=0.3&type=rescue_alert&limit=10',
  );
});
