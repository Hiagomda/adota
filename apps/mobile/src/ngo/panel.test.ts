import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Post } from '../types';
import {
  accentTone,
  animalsOf,
  averageWaitDays,
  greeting,
  panelHighlight,
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

  it('escreve a espera em pouco espaço', () => {
    assert.equal(waitShort(null), '–');
    assert.equal(waitShort(1), '1 dia');
    assert.equal(waitShort(12), '12 dias');
    assert.equal(waitShort(21), '3 sem');
    assert.equal(waitShort(45), '6 sem');
    assert.equal(waitShort(70), '2 meses');
  });

  it('cumprimenta pelo relógio de Belém', () => {
    assert.equal(greeting(new Date('2026-10-31T11:00:00Z')), 'Bom dia');
    assert.equal(greeting(new Date('2026-10-31T18:00:00Z')), 'Boa tarde');
    assert.equal(greeting(new Date('2026-10-31T23:30:00Z')), 'Boa noite');
    assert.equal(greeting(new Date('2026-11-01T02:00:00Z')), 'Boa noite');
  });
});

describe('recado do Cupu no painel', () => {
  const base = {
    org: {
      name: 'Patas',
      handle: 'patas',
      avatarUrl: null,
      role: 'ngo',
      instagram: null,
      neighborhood: null,
    },
    theme: { accent: 'turquoise' as const, tagline: null },
    stats: {
      rescue: 0,
      care: 0,
      forAdoption: 0,
      adoptedTotal: 0,
      adoptedThisMonth: 0,
      newInterests: 0,
    },
    animals: [] as PanelAnimal[],
    recentInterests: [],
  };
  const named = (item: PanelAnimal, name: string) => {
    item.post.animal = { name } as Post['animal'];
    return item;
  };

  it('chama atenção para ficha nova antes de tudo', () => {
    const tip = panelHighlight(
      { ...base, stats: { ...base.stats, newInterests: 3, adoptedThisMonth: 2 } },
      now,
    );
    assert.equal(tip.pose, 'party');
    assert.equal(tip.title, '3 fichas novas esta semana!');
  });

  it('lembra de quem espera há mais de um mês', () => {
    const tip = panelHighlight(
      {
        ...base,
        animals: [
          named(animal('a', 'for_adoption', 10), 'Mel'),
          named(animal('b', 'for_adoption', 45), 'Nina'),
        ],
      },
      now,
    );
    assert.equal(tip.pose, 'search');
    assert.equal(tip.title, 'Nina espera há 6 semanas');
  });

  it('comemora as adoções do mês e, sem nada, sugere o próximo passo', () => {
    assert.equal(
      panelHighlight({ ...base, stats: { ...base.stats, adoptedThisMonth: 1 } }, now).title,
      '1 adoção este mês!',
    );
    assert.equal(panelHighlight(base, now).pose, 'wave');
  });
});
