import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  distanceText,
  furColorsText,
  lostSearchPath,
  posterLink,
  posterShareMessage,
  sortedReasons,
  toggleFurColor,
} from './lostMatch.ts';

test('marca no máximo três cores e desmarca', () => {
  assert.deepEqual(toggleFurColor([], 'black'), ['black']);
  assert.deepEqual(toggleFurColor(['black', 'white', 'gray'], 'brown'), ['black', 'white', 'gray']);
  assert.deepEqual(toggleFurColor(['black', 'white'], 'black'), ['white']);
});

test('escreve as cores em português e ignora as desconhecidas', () => {
  assert.equal(furColorsText(['caramel', 'white']), 'caramelo e branco');
  assert.equal(furColorsText(['black', 'roxo']), 'preto');
  assert.equal(furColorsText(undefined), '');
});

test('distância nunca mostra o ponto exato', () => {
  assert.equal(distanceText(0.5), 'a menos de 1 km');
  assert.equal(distanceText(2.5), 'a 2,5 km');
});

test('motivos a favor primeiro, espécie fora', () => {
  const reasons = sortedReasons([
    { code: 'species', label: 'Mesma espécie', points: 0, max: 0 },
    { code: 'sex', label: 'Sexo diferente', points: -15, max: 5 },
    { code: 'distance', label: 'Perto', points: 25, max: 25 },
    { code: 'size', label: 'Mesmo porte', points: 20, max: 20 },
  ]);
  assert.deepEqual(
    reasons.map((reason) => reason.code),
    ['distance', 'size', 'sex'],
  );
});

test('monta a busca só com o que foi preenchido', () => {
  const path = lostSearchPath({
    species: 'dog',
    size: null,
    sex: 'female',
    colors: ['caramel', 'white'],
    text: '  coleira  ',
    latitude: -1.452345678,
    longitude: -48.48321,
  });
  assert.equal(
    path,
    '/lost-search?species=dog&latitude=-1.45235&longitude=-48.48321&sex=female&colors=caramel%2Cwhite&text=coleira',
  );
});

test('cartaz pela página de download, com aviso contra golpe', () => {
  const link = posterLink('https://download.exemplo/', 'abc');
  assert.equal(link, 'https://download.exemplo/api/posts/abc/poster');
  const message = posterShareMessage(
    { lost: true, name: 'Pipoca', species: 'Cachorro', place: 'Nazaré' },
    link,
  );
  assert.match(message, /PROCURA-SE: Pipoca sumiu em Nazaré/);
  assert.match(message, /dinheiro/);
});
