import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cupuPrefill,
  isGrave,
  lostDescription,
  lostUrgency,
  rescueDescription,
  rescueGuidance,
  suggestUrgency,
  tidySentence,
  urgencyReason,
} from './assistant.ts';

test('urgência: grave ou filhotes é urgente, doente é atenção, só solto pode esperar', () => {
  assert.equal(suggestUrgency(['bleeding']), 'high');
  assert.equal(suggestUrgency(['calm', 'hit_by_car']), 'high');
  assert.equal(suggestUrgency(['puppies']), 'high');
  assert.equal(suggestUrgency(['sick']), 'medium');
  assert.equal(suggestUrgency(['calm']), 'low');
  assert.equal(suggestUrgency(['sick', 'calm']), 'medium');
});

test('sem nada marcado a urgência fica em atenção, não some', () => {
  assert.equal(suggestUrgency([]), 'medium');
  assert.match(urgencyReason([]), /olhar logo/);
});

test('a razão explica o porquê de cada nível', () => {
  assert.match(urgencyReason(['trapped']), /minutos/);
  assert.match(urgencyReason(['puppies']), /Filhote/);
  assert.match(urgencyReason(['calm']), /tempo/);
});

test('grave só com ferimento, atropelamento, preso ou sem andar', () => {
  assert.equal(isGrave(['sick', 'puppies', 'calm']), false);
  assert.equal(isGrave(['cant_walk']), true);
});

test('descrição do resgate em ordem fixa, com o texto livre arrumado', () => {
  assert.equal(
    rescueDescription(['cant_walk', 'bleeding'], 'dog', '  perto da   feira da 25 '),
    'Cachorro na rua. Está ferido e sangrando. Não consegue andar. Perto da feira da 25.',
  );
});

test('"parece bem" sai da descrição quando há outro sinal', () => {
  assert.equal(
    rescueDescription(['calm', 'sick'], 'cat', ''),
    'Gato na rua. Está magro ou parece doente.',
  );
  assert.equal(
    rescueDescription(['calm'], 'other', ''),
    'Animal na rua. Está solto na rua, sem ferimento aparente.',
  );
});

test('filhotes não repetem "na rua" do adulto', () => {
  assert.equal(
    rescueDescription(['puppies'], 'dog', ''),
    'Filhotes sozinhos, sem a mãe por perto.',
  );
});

test('tidySentence mantém pontuação que já existe', () => {
  assert.equal(tidySentence('socorro!'), 'Socorro!');
  assert.equal(tidySentence('   '), '');
});

test('perdido: quando sumiu, coleira e o texto', () => {
  assert.equal(
    lostDescription('today', true, 'atende por Paçoca'),
    'Sumiu hoje. Usa coleira. Atende por Paçoca.',
  );
  assert.equal(lostDescription('older', false, ''), 'Sumiu há alguns dias.');
  assert.equal(lostUrgency('today'), 'high');
  assert.equal(lostUrgency('older'), 'medium');
});

test('orientação imediata só aparece para o que foi marcado', () => {
  assert.deepEqual(rescueGuidance(['calm']), []);
  const trapped = rescueGuidance(['trapped']).map((step) => step.id);
  assert.ok(trapped.includes('firefighters'));
  assert.ok(trapped.includes('safety'));
  assert.ok(!trapped.includes('bleeding'));
  const hit = rescueGuidance(['hit_by_car']).map((step) => step.id);
  assert.ok(hit.includes('move'));
  assert.equal(hit.at(-1), 'publish');
  assert.deepEqual(
    rescueGuidance(['sick']).map((step) => step.id),
    ['medicine'],
  );
});

test('cupuPrefill confere o que veio pela rota', () => {
  assert.deepEqual(
    cupuPrefill({
      cupu: '1',
      kind: 'lost',
      urgency: 'high',
      species: 'cat',
      description: 'Sumiu hoje.',
    }),
    { id: '1', kind: 'lost', urgency: 'high', species: 'cat', description: 'Sumiu hoje.' },
  );
  assert.equal(cupuPrefill({ kind: 'lost', urgency: 'high' }), null);
  assert.equal(cupuPrefill({ cupu: '1', kind: 'adoption', urgency: 'high' }), null);
  assert.equal(cupuPrefill({ cupu: '1', kind: 'rescue_alert', urgency: 'max' }), null);
  assert.equal(
    cupuPrefill({ cupu: ['2'], kind: 'rescue_alert', urgency: 'low', species: 'x' })?.species,
    null,
  );
});
