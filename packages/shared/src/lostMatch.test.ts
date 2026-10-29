import { describe, expect, it } from 'vitest';
import {
  colorBin,
  colorsFromText,
  lostSearchSchema,
  marksFromText,
  matchStrength,
  paletteFromPixels,
  paletteSimilarity,
  scoreLostMatch,
  type MatchAnimal,
} from './lostMatch.js';

const lostAt = new Date('2026-10-01T12:00:00Z');

function animal(overrides: Partial<MatchAnimal> = {}): MatchAnimal {
  return {
    species: 'dog',
    size: 'medium',
    sex: 'female',
    colors: ['caramel'],
    text: 'Cadela caramelo com coleira vermelha',
    palette: null,
    ...overrides,
  };
}

function daysAfter(days: number): Date {
  return new Date(lostAt.getTime() + days * 86_400_000);
}

describe('colorsFromText', () => {
  it('lê as cores escritas, com e sem acento', () => {
    expect(colorsFromText('Gata PRETA e branca, olhos verdes')).toEqual(['black', 'white']);
    expect(colorsFromText('cachorro marrom, rajado')).toEqual(['brown', 'brindle']);
  });

  it('não confunde o nome Mel com cor', () => {
    expect(colorsFromText('A Mel fugiu ontem')).toEqual([]);
  });
});

describe('marksFromText', () => {
  it('agrupa sinais parecidos', () => {
    expect(marksFromText('Está mancando e tem uma plaquinha')).toEqual(['coleira', 'manca']);
  });
});

describe('scoreLostMatch', () => {
  it('dá nota alta para o mesmo animal visto perto e logo depois', () => {
    const result = scoreLostMatch(animal(), animal({ text: 'Achei cadela caramelo de coleira' }), {
      distanceKm: 0.8,
      lostAt,
      seenAt: daysAfter(1),
    });
    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThanOrEqual(75);
    expect(matchStrength(result?.score ?? 0)).toBe('high');
    const codes = result?.reasons.map((reason) => reason.code);
    expect(codes).toEqual(
      expect.arrayContaining(['species', 'size', 'colors', 'distance', 'time', 'marks', 'sex']),
    );
  });

  it('descarta espécie diferente, longe demais ou visto antes de sumir', () => {
    const near = { distanceKm: 1, lostAt, seenAt: daysAfter(1) };
    expect(scoreLostMatch(animal(), animal({ species: 'cat' }), near)).toBeNull();
    expect(scoreLostMatch(animal(), animal(), { ...near, distanceKm: 20 })).toBeNull();
    expect(scoreLostMatch(animal(), animal(), { ...near, seenAt: daysAfter(-5) })).toBeNull();
    expect(scoreLostMatch(animal(), animal(), { ...near, seenAt: daysAfter(200) })).toBeNull();
  });

  it('tira pontos de porte e sexo diferentes e explica', () => {
    const result = scoreLostMatch(
      animal({ size: 'small' }),
      animal({ size: 'large', sex: 'male' }),
      {
        distanceKm: 1,
        lostAt,
        seenAt: daysAfter(1),
      },
    );
    expect(result?.score).toBeLessThan(50);
    expect(result?.reasons.find((reason) => reason.code === 'sex')?.label).toBe('Sexo diferente');
    expect(result?.reasons.find((reason) => reason.code === 'size')?.points).toBeLessThan(0);
  });

  it('usa a cor escrita quando ninguém marcou as cores', () => {
    const result = scoreLostMatch(
      animal({ colors: [] }),
      animal({ colors: [], text: 'cachorra amarela' }),
      { distanceKm: 2, lostAt, seenAt: daysAfter(3) },
    );
    expect(result?.reasons.find((reason) => reason.code === 'colors')?.label).toBe(
      'Cor em comum: caramelo',
    );
  });

  it('a nota nunca passa de 100 nem fica negativa', () => {
    const best = scoreLostMatch(
      animal({ palette: [0, 0, 0, 0, 1, 0, 0] }),
      animal({ palette: [0, 0, 0, 0, 1, 0, 0], text: 'coleira, manca, castrada, caramelo' }),
      { distanceKm: 0, lostAt, seenAt: lostAt },
    );
    expect(best?.score).toBeLessThanOrEqual(100);
    const worst = scoreLostMatch(
      animal({ colors: ['black'], size: 'small', sex: 'male' }),
      animal({ colors: ['white'], size: 'large', sex: 'female', text: '' }),
      { distanceKm: 15, lostAt, seenAt: daysAfter(100) },
    );
    expect(worst?.score).toBe(0);
  });
});

describe('paletas de foto', () => {
  it('separa preto, branco e caramelo', () => {
    expect(colorBin(10, 10, 10)).toBe(0);
    expect(colorBin(245, 245, 240)).toBe(1);
    expect(colorBin(200, 140, 70)).toBe(4);
    // Grama verde não conta como cor de pelo.
    expect(colorBin(60, 160, 60)).toBe(2);
  });

  it('compara pela sobreposição das faixas', () => {
    const caramel = paletteFromPixels([200, 140, 70, 200, 140, 70, 10, 10, 10, 200, 140, 70]);
    expect(caramel.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 2);
    expect(paletteSimilarity(caramel, caramel)).toBeCloseTo(1, 2);
    const black = paletteFromPixels([10, 10, 10]);
    expect(paletteSimilarity(caramel, black)).toBeCloseTo(0.25, 2);
    expect(paletteSimilarity(caramel, [1])).toBe(0);
  });
});

describe('lostSearchSchema', () => {
  it('aceita cores separadas por vírgula e ignora o que não conhece', () => {
    const parsed = lostSearchSchema.parse({
      species: 'cat',
      colors: 'black,roxo,white',
      latitude: '-1.45',
      longitude: '-48.49',
    });
    expect(parsed.colors).toEqual(['black', 'white']);
    expect(parsed.latitude).toBe(-1.45);
  });
});
