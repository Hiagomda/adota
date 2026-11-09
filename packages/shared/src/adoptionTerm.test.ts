import { describe, expect, it } from 'vitest';
import {
  defaultTermTemplate,
  fillTerm,
  formatCpf,
  orgTermSchema,
  termAcceptSchema,
  validCpf,
} from './adoptionTerm.js';

const date = new Date('2026-11-09T15:00:00Z');

describe('termo de adoção', () => {
  it('pede castração só de quem não é castrado', () => {
    expect(defaultTermTemplate({ species: 'dog', neutered: false })).toContain('Castrar');
    expect(defaultTermTemplate({ species: 'dog', neutered: null })).toContain('Castrar');
    expect(defaultTermTemplate({ species: 'dog', neutered: true })).not.toContain('Castrar o');
  });

  it('tem cláusula de telas para gato e de corrente para cão', () => {
    const cat = defaultTermTemplate({ species: 'cat', neutered: true });
    const dog = defaultTermTemplate({ species: 'dog', neutered: true });
    expect(cat).toContain('telas');
    expect(cat).not.toContain('corrente');
    expect(dog).toContain('corrente');
    expect(dog).not.toContain('telas');
  });

  it('preenche os campos e deixa espaço para o nome antes do aceite', () => {
    const template = defaultTermTemplate({ species: 'cat', neutered: false });
    const animal = { name: 'Mel', species: 'cat', sex: 'female', neutered: false };
    const blank = fillTerm(template, { adopter: null, giver: 'ONG Patas', animal, date });
    expect(blank).toContain('Eu, ____');
    expect(blank).toContain('Mel (gata)');
    expect(blank).toContain('ONG Patas');
    expect(blank).toContain('9 de novembro de 2026');
    expect(blank).not.toMatch(/\{(adotante|animal|quem_entrega|data)\}/);
    const signed = fillTerm(template, { adopter: 'Ana Souza', giver: 'ONG Patas', animal, date });
    expect(signed).toContain('Eu, Ana Souza');
  });

  it('sem nome usa a espécie e mantém chaves desconhecidas', () => {
    const animal = { name: null, species: 'dog', sex: 'male', neutered: true };
    expect(fillTerm('{animal} e {outra}', { adopter: 'A B', giver: 'X', animal, date })).toBe(
      'o cão e {outra}',
    );
  });

  it('confere CPF', () => {
    expect(validCpf('529.982.247-25')).toBe(true);
    expect(validCpf('52998224725')).toBe(true);
    expect(validCpf('529.982.247-26')).toBe(false);
    expect(validCpf('111.111.111-11')).toBe(false);
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });

  it('aceite exige nome e sobrenome e a concordância', () => {
    expect(termAcceptSchema.safeParse({ fullName: 'Ana Souza', agree: true }).success).toBe(true);
    expect(termAcceptSchema.safeParse({ fullName: 'Ana', agree: true }).success).toBe(false);
    expect(termAcceptSchema.safeParse({ fullName: 'Ana Souza', agree: false }).success).toBe(false);
    expect(
      termAcceptSchema.safeParse({ fullName: 'Ana Souza', cpf: '123', agree: true }).success,
    ).toBe(false);
  });

  it('termo da ONG tem tamanho mínimo e pode voltar ao do app', () => {
    expect(orgTermSchema.safeParse({ body: 'curto' }).success).toBe(false);
    expect(orgTermSchema.safeParse({ body: null }).success).toBe(true);
    expect(orgTermSchema.safeParse({ body: 'a'.repeat(300), requireIdentity: true }).success).toBe(
      true,
    );
  });
});
