import { describe, expect, it } from 'vitest';
import {
  adoptionEventSchema,
  adoptionInterestSchema,
  daysWaiting,
  verificationRequestSchema,
} from './adoption.js';

const inAWeek = new Date(Date.now() + 7 * 86_400_000);

function event(startsAt: Date, hours: number) {
  return {
    title: 'Feira da Patas no Bosque',
    placeLabel: 'Bosque Rodrigues Alves, Marco',
    latitude: -1.43,
    longitude: -48.46,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + hours * 3_600_000).toISOString(),
  };
}

describe('adoption interest', () => {
  it('accepts the short form and refuses unknown answers', () => {
    const answers = {
      home: 'apartment',
      safeHome: 'will_do',
      otherAnimals: 'cats',
      household: 'all_agree',
      hadPets: true,
    };
    expect(adoptionInterestSchema.safeParse(answers).success).toBe(true);
    expect(adoptionInterestSchema.safeParse({ ...answers, home: 'castle' }).success).toBe(false);
    expect(adoptionInterestSchema.safeParse({ ...answers, cpf: '123' }).success).toBe(false);
  });
});

describe('adoption events', () => {
  it('takes a fair of a few hours', () => {
    expect(adoptionEventSchema.safeParse(event(inAWeek, 4)).success).toBe(true);
  });

  it('refuses a fair that ends before it starts or lasts days', () => {
    expect(adoptionEventSchema.safeParse(event(inAWeek, -1)).success).toBe(false);
    expect(adoptionEventSchema.safeParse(event(inAWeek, 30)).success).toBe(false);
  });

  it('refuses a fair more than six months away', () => {
    const far = new Date(Date.now() + 200 * 86_400_000);
    expect(adoptionEventSchema.safeParse(event(far, 3)).success).toBe(false);
  });
});

describe('verification request', () => {
  it('keeps old app requests working', () => {
    const parsed = verificationRequestSchema.parse({
      organizationName: 'Patas do Marco',
      note: 'Atuo em Belém.',
    });
    expect(parsed.kind).toBe('ngo');
  });

  it('cleans the Instagram handle and the CNPJ', () => {
    const parsed = verificationRequestSchema.parse({
      kind: 'protector',
      organizationName: 'Maria Protetora',
      instagram: '@maria.protetora',
      cnpj: '12.345.678/0001-90',
    });
    expect(parsed.instagram).toBe('maria.protetora');
    expect(parsed.cnpj).toBe('12345678000190');
    expect(
      verificationRequestSchema.safeParse({ organizationName: 'X ONG', cnpj: '123' }).success,
    ).toBe(false);
  });
});

describe('days waiting', () => {
  it('counts whole days and never goes negative', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    expect(daysWaiting(new Date('2026-09-19T13:00:00Z'), now)).toBe(29);
    expect(daysWaiting(new Date('2026-10-20T12:00:00Z'), now)).toBe(0);
  });
});
