import { describe, expect, it } from 'vitest';
import { municipalityCodesMatching, municipalityParamSchema } from './municipality.js';
import {
  coverageText,
  insideServiceArea,
  municipalities,
  municipalitiesNear,
  municipalityAt,
  resolveMunicipality,
} from './serviceArea.js';

const at = (latitude: number, longitude: number) => municipalityAt({ latitude, longitude })?.slug;

describe('municípios atendidos', () => {
  it('começa com os sete da região', () => {
    expect(municipalities.map((item) => item.slug)).toEqual([
      'belem',
      'ananindeua',
      'marituba',
      'benevides',
      'santa-barbara-do-para',
      'castanhal',
      'barcarena',
    ]);
    expect(coverageText).toContain('Castanhal e Barcarena');
  });

  it('acha o município pelo ponto, com ilhas e zona rural', () => {
    expect(at(-1.4523, -48.4832)).toBe('belem'); // Centro
    expect(at(-1.165, -48.43)).toBe('belem'); // Mosqueiro
    expect(at(-1.245, -48.55)).toBe('belem'); // Cotijuba
    expect(at(-1.3655, -48.3724)).toBe('ananindeua');
    expect(at(-1.36, -48.342)).toBe('marituba');
    expect(at(-1.3617, -48.2448)).toBe('benevides');
    expect(at(-1.2235, -48.2945)).toBe('santa-barbara-do-para');
    expect(at(-1.2964, -47.9262)).toBe('castanhal');
    expect(at(-1.4, -47.8)).toBe('castanhal'); // zona rural, longe da sede
    expect(at(-1.5058, -48.6253)).toBe('barcarena');
    expect(at(-1.545, -48.75)).toBe('barcarena'); // Vila do Conde
  });

  it('deixa de fora quem está longe e ponto inválido', () => {
    expect(at(-23.5505, -46.6333)).toBeUndefined(); // São Paulo
    expect(at(-1.72, -48.88)).toBeUndefined(); // Abaetetuba
    expect(at(-1.2, -47.18)).toBeUndefined(); // Capanema
    expect(at(Number.NaN, -48.4)).toBeUndefined();
    expect(insideServiceArea({ latitude: 95, longitude: -48.4 })).toBe(false);
  });

  it('perto da divisa oferece os dois municípios e aceita a escolha da pessoa', () => {
    // BR-316 na divisa Belém x Ananindeua (Entroncamento/Castanheira).
    const border = { latitude: -1.3913, longitude: -48.4262 };
    const near = municipalitiesNear(border).map((item) => item.slug);
    expect(near).toContain('belem');
    expect(near).toContain('ananindeua');
    expect(resolveMunicipality(border, '1500800')?.slug).toBe('ananindeua');
    expect(resolveMunicipality(border, '1501402')?.slug).toBe('belem');
  });

  it('não aceita escolha de município longe do ponto', () => {
    const belem = { latitude: -1.4523, longitude: -48.4832 };
    // Castanhal fica a ~60 km: o ponto manda, a escolha é ignorada.
    expect(resolveMunicipality(belem, '1502400')?.slug).toBe('belem');
    expect(resolveMunicipality({ latitude: -23.55, longitude: -46.63 }, '1502400')).toBeNull();
  });

  it('busca e filtro por nome, slug ou código', () => {
    expect(municipalityCodesMatching('castanhal')).toEqual(['1502400']);
    expect(municipalityCodesMatching('Belem')).toEqual(['1501402']);
    expect(municipalityCodesMatching('ba')).toEqual([]);
    expect(municipalityParamSchema.parse('barcarena')).toBe('1501303');
    expect(municipalityParamSchema.parse('1501402')).toBe('1501402');
    expect(municipalityParamSchema.parse('Santa-Barbara-do-Para')).toBe('1506351');
    expect(municipalityParamSchema.safeParse('sao-paulo').success).toBe(false);
  });
});
