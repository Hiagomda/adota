import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  answerLines,
  completeAnswers,
  interestMessage,
  safeHomeQuestion,
  type AdoptionAnswers,
} from './adoptionInterest.ts';

const answers: AdoptionAnswers = {
  home: 'apartment',
  safeHome: 'will_do',
  otherAnimals: 'none',
  household: 'all_agree',
  hadPets: false,
};

describe('ficha de adoção', () => {
  it('só fica completa com as cinco respostas', () => {
    assert.equal(completeAnswers({ home: 'house' }), null);
    assert.deepEqual(completeAnswers(answers), answers);
    assert.deepEqual(completeAnswers({ ...answers, hadPets: false }), answers);
  });

  it('pergunta pela tela no gato e pelo muro no cão', () => {
    assert.match(safeHomeQuestion('cat'), /tela/);
    assert.match(safeHomeQuestion('dog'), /muro/);
    assert.deepEqual(answerLines(answers, 'cat'), [
      'Mora em apartamento',
      'Vai colocar tela nas janelas',
      'Sem outros animais',
      'Todos em casa concordam',
      'Primeiro animal',
    ]);
    assert.equal(answerLines(answers, 'other')[1], 'Vai deixar a casa segura');
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
