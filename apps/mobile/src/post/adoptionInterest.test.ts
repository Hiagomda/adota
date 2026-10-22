import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerLines,
  completeAnswers,
  fitWarnings,
  interestMessage,
  missingCount,
  safeHomeQuestion,
  visibleQuestions,
  type AdoptionAnswers,
} from './adoptionInterest.ts';

const answers: AdoptionAnswers = {
  home: 'apartment',
  buildingAllows: 'yes',
  safeHome: 'will_do',
  otherAnimals: 'none',
  household: 'all_agree',
  kids: false,
  hadPets: false,
};

/** Ficha salva por versões antigas do app, antes das perguntas que dependem da resposta. */
const oldAnswers: AdoptionAnswers = {
  home: 'apartment',
  safeHome: 'will_do',
  otherAnimals: 'none',
  household: 'all_agree',
  hadPets: false,
};

describe('ficha de adoção', () => {
  it('só fica completa com todas as respostas da tela', () => {
    assert.equal(completeAnswers({ home: 'house' }), null);
    assert.deepEqual(completeAnswers(answers), answers);
    assert.deepEqual(completeAnswers({ ...answers, hadPets: false }), answers);
  });

  it('pergunta pela tela no gato e pelo muro no cão', () => {
    assert.match(safeHomeQuestion('cat'), /tela/);
    assert.match(safeHomeQuestion('dog', 'house'), /muro/);
    assert.match(safeHomeQuestion('dog'), /segura/);
    assert.deepEqual(answerLines(answers, 'cat'), [
      'Mora em apartamento',
      'Condomínio aceita animais',
      'Vai colocar tela nas janelas e na varanda',
      'Sem outros animais',
      'Todos em casa concordam',
      'Sem crianças',
      'Primeiro animal',
    ]);
    assert.equal(answerLines(answers, 'other')[2], 'Vai deixar a casa segura');
    assert.equal(answerLines(oldAnswers, 'cat').length, 5);
  });

  it('muda a pergunta de segurança com a moradia', () => {
    assert.match(safeHomeQuestion('cat', 'apartment'), /varanda/);
    assert.match(safeHomeQuestion('dog', 'apartment'), /grade/);
    assert.match(safeHomeQuestion('dog', 'house'), /muro/);
    assert.doesNotMatch(safeHomeQuestion('dog', 'apartment'), /quintal/);
  });

  it('só pergunta do condomínio, dos cuidados e das crianças quando cabe', () => {
    assert.deepEqual(visibleQuestions({ home: 'house', otherAnimals: 'none' }), [
      'home',
      'safeHome',
      'otherAnimals',
      'livesWith',
      'hadPets',
    ]);
    assert.deepEqual(
      visibleQuestions({ home: 'apartment', otherAnimals: 'cats', livesWith: 'others' }),
      [
        'home',
        'buildingAllows',
        'safeHome',
        'otherAnimals',
        'othersCared',
        'livesWith',
        'household',
        'kids',
        'hadPets',
      ],
    );
  });

  it('pede as perguntas novas de quem tem ficha antiga', () => {
    // Ficha antiga de apartamento sem condomínio e com família: faltam condomínio e criança.
    assert.equal(missingCount(oldAnswers), 2);
    assert.equal(completeAnswers(oldAnswers), null);
    const full = completeAnswers({ ...oldAnswers, buildingAllows: 'yes', kids: false });
    assert.deepEqual(full, { ...answers, buildingAllows: 'yes', kids: false });
  });

  it('quem mora só não responde se todos concordam', () => {
    const alone = completeAnswers({
      home: 'house',
      safeHome: 'yes',
      otherAnimals: 'none',
      livesWith: 'alone',
      hadPets: true,
    });
    assert.equal(alone?.household, 'alone');
    assert.equal(alone?.kids, undefined);
    // Trocar de "moro só" para "com outras pessoas" pede a concordância de novo.
    assert.equal(missingCount({ ...alone, livesWith: 'others' }), 2);
  });

  it('avisa quando a ficha bate de frente com o que o animal precisa', () => {
    const draft = { otherAnimals: 'dogs' as const, livesWith: 'others' as const, kids: true };
    assert.equal(fitWarnings(draft, { goodWithAnimals: false, goodWithKids: false }).length, 2);
    assert.equal(fitWarnings(draft, { goodWithAnimals: true }).length, 0);
    assert.equal(fitWarnings({ home: 'apartment', buildingAllows: 'no' }, null).length, 1);
  });

  it('escreve a mensagem com a ficha, a nota e o link', () => {
    const text = interestMessage({
      authorFirstName: 'Ana',
      animalRef: 'Mel',
      answers,
      species: 'cat',
      note: '  Trabalho em casa. ',
      link: 'https://egua.app/p/1',
    });
    assert.ok(text.startsWith('Oi, Ana! Vi o post de adoção de Mel'));
    assert.ok(text.includes('• Mora em apartamento'));
    assert.ok(text.includes('\n\nTrabalho em casa.\n'));
    assert.ok(text.endsWith('https://egua.app/p/1'));
  });

  it('sem nota não deixa linha vazia sobrando', () => {
    const text = interestMessage({
      authorFirstName: 'Ana',
      animalRef: 'Mel',
      answers,
      species: 'dog',
      note: '',
      link: 'L',
    });
    assert.ok(!text.includes('\n\n\n'));
  });
});
