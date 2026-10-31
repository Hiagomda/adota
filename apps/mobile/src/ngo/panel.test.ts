import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Post } from '../types';
import {
  accentTone,
  animalsOf,
  averageWaitDays,
  greeting,
  interestLabel,
  waitShort,
  type PanelAnimal,
} from './panel.ts';

const now = new Date('2026-10-31T15:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function animal(
  id: string,
  status: string,
  sinceDays: number,
  newInterests = 0,
  interests = newInterests,
): PanelAnimal {
  const post = {
    id,
    status,
    createdAt: daysAgo(sinceDays + 30),
    adoptionSince: status === 'for_adoption' ? daysAgo(sinceDays) : null,
  } as Post;
  return { post, interests, newInterests };
}

describe('painel da ONG', () => {
  it('troca a cor por um tom do app e cai no turquesa quando não conhece', () => {
    assert.equal(accentTone('coral'), 'secondary');
    assert.equal(accentTone('green'), 'success');
    assert.equal(accentTone('#ff0000'), 'primary');
    assert.equal(accentTone(null), 'primary');
  });

  it('põe na frente quem tem ficha nova e depois quem espera há mais tempo', () => {
    const list = [
      animal('novo', 'for_adoption', 3),
      animal('antigo', 'for_adoption', 90),
      animal('com-ficha', 'for_adoption', 10, 1),
      animal('lar', 'fostered', 0),
      animal('adotado', 'adopted', 0),
    ];
    assert.deepEqual(
      animalsOf(list, 'adoption').map((item) => item.post.id),
      ['com-ficha', 'antigo', 'novo'],
    );
    assert.deepEqual(
      animalsOf(list, 'care').map((item) => item.post.id),
      ['lar'],
    );
    assert.deepEqual(
      animalsOf(list, 'adopted').map((item) => item.post.id),
      ['adotado'],
    );
  });

  it('calcula a espera média só de quem está para adoção', () => {
    const list = [
      animal('a', 'for_adoption', 10),
      animal('b', 'for_adoption', 30),
      animal('c', 'adopted', 0),
    ];
    assert.equal(averageWaitDays(list, now), 20);
    assert.equal(averageWaitDays([animal('c', 'adopted', 0)], now), null);
  });

  it('escreve a espera e as fichas em pouco espaço', () => {
    assert.equal(waitShort(null), '–');
    assert.equal(waitShort(1), '1 dia');
    assert.equal(waitShort(12), '12 dias');
    assert.equal(waitShort(21), '3 sem');
    assert.equal(waitShort(45), '6 sem');
    assert.equal(waitShort(70), '2 meses');
    assert.equal(interestLabel(0, 0), null);
    assert.equal(interestLabel(1, 0), '1 ficha');
    assert.equal(interestLabel(3, 1), '3 fichas · 1 nova');
    assert.equal(interestLabel(4, 2), '4 fichas · 2 novas');
  });

  it('cumprimenta pelo relógio de Belém', () => {
    assert.equal(greeting(new Date('2026-10-31T11:00:00Z')), 'Bom dia');
    assert.equal(greeting(new Date('2026-10-31T18:00:00Z')), 'Boa tarde');
    assert.equal(greeting(new Date('2026-10-31T23:30:00Z')), 'Boa noite');
    assert.equal(greeting(new Date('2026-11-01T02:00:00Z')), 'Boa noite');
  });
});
