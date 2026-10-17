import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postShareLink, postShareMessage } from './shareMessage.ts';

const link = postShareLink('https://download.exemplo/', 'abc-123');

test('links to the download page with the post id', () => {
  assert.equal(link, 'https://download.exemplo/?post=abc-123');
});

test('adoption message names the animal, the place and ends with the link', () => {
  const text = postShareMessage(
    { id: 'abc-123', status: 'for_adoption', name: 'Mel', species: 'Gato', place: 'Umarizal' },
    link,
  );
  assert.match(text, /^🐾 Mel procura um lar em Umarizal!/);
  assert.ok(text.includes(`\n\n${link}\n\n`));
});

test('an animal without a name goes by its species', () => {
  const text = postShareMessage(
    { id: 'abc-123', status: 'open', name: '  ', species: 'Cachorro', place: 'Marco' },
    link,
  );
  assert.match(text, /^🚨 Um cachorro precisa de resgate em Marco\./);
});

test('rescued animals get the follow-the-story message', () => {
  const text = postShareMessage(
    { id: 'abc-123', status: 'fostered', name: null, species: 'Gato', place: '' },
    link,
  );
  assert.match(text, /^🐾 Acompanhe a história de um gato no Égua, adota!/);
});
