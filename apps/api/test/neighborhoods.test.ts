import { describe, expect, it } from 'vitest';
import { neighborhoodFromLabel, rankNeighborhoods } from '../src/neighborhoods.js';

describe('neighborhoodFromLabel', () => {
  it('reads the address lookup format', () => {
    expect(neighborhoodFromLabel('Travessa Quintino, 1200 · Marco · Belém')).toBe('Marco');
    expect(neighborhoodFromLabel('Umarizal · Belém')).toBe('Umarizal');
  });

  it('reads a typed "bairro, cidade" label', () => {
    expect(neighborhoodFromLabel('Nazaré, Belém')).toBe('Nazaré');
  });

  it('gives up on coordinates or a single word', () => {
    expect(neighborhoodFromLabel('-1.45234, -48.48321')).toBeNull();
    expect(neighborhoodFromLabel('Belém')).toBeNull();
  });
});

describe('rankNeighborhoods', () => {
  it('counts per neighborhood, ignoring case, biggest first', () => {
    expect(
      rankNeighborhoods([
        'Marco, Belém',
        'Rua A · Marco · Belém',
        'Nazaré, Belém',
        'marco, Belém',
        '-1.4, -48.4',
      ]),
    ).toEqual([
      { name: 'Marco', rescued: 3 },
      { name: 'Nazaré', rescued: 1 },
    ]);
  });
});
