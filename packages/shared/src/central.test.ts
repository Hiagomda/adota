import { describe, expect, it } from 'vitest';
import {
  centralQuerySchema,
  centralScore,
  helpOfferSchema,
  nextOfferStatus,
  publicDistanceKm,
  type CentralScoreInput,
} from './central.js';

const base: CentralScoreInput = {
  urgency: 'medium',
  status: 'open',
  ageHours: 1,
  goingCount: 0,
  offerCount: 0,
  hasFoster: false,
  distanceKm: null,
};

describe('central score', () => {
  it('puts an urgent case without help above a calm case with someone going', () => {
    const urgent = centralScore({ ...base, urgency: 'high' });
    const calm = centralScore({ ...base, urgency: 'low', goingCount: 1 });
    expect(urgent.score).toBeGreaterThan(calm.score);
    expect(urgent.reasons).toContain('Marcado como urgente');
    expect(urgent.reasons).toContain('Ninguém a caminho');
    expect(calm.reasons).not.toContain('Ninguém a caminho');
  });

  it('does not let distance beat urgency', () => {
    const farUrgent = centralScore({ ...base, urgency: 'high', distanceKm: 40 });
    const nearLow = centralScore({ ...base, urgency: 'low', distanceKm: 0.2 });
    expect(farUrgent.score).toBeGreaterThan(nearLow.score);
    expect(nearLow.reasons).toContain('Bem perto de você');
  });

  it('grows with waiting time only up to a day', () => {
    const fresh = centralScore({ ...base, ageHours: 0 });
    const day = centralScore({ ...base, ageHours: 24 });
    const week = centralScore({ ...base, ageHours: 24 * 7 });
    expect(day.score).toBeGreaterThan(fresh.score);
    expect(week.score).toBe(day.score);
    expect(week.reasons).toContain('Esperando há 7 dias');
  });

  it('asks for a foster home once the animal is off the street', () => {
    const rescued = centralScore({ ...base, status: 'rescued' });
    expect(rescued.reasons).toContain('Resgatado, precisa de lar temporário');
    expect(rescued.reasons).not.toContain('Ninguém a caminho');
    const housed = centralScore({ ...base, status: 'rescued', hasFoster: true, offerCount: 1 });
    expect(housed.reasons).not.toContain('Resgatado, precisa de lar temporário');
  });
});

describe('help offers', () => {
  it('needs a few words for "other"', () => {
    expect(helpOfferSchema.safeParse({ kind: 'other' }).success).toBe(false);
    expect(
      helpOfferSchema.safeParse({ kind: 'other', note: 'Tenho caixa de transporte' }).success,
    ).toBe(true);
    expect(helpOfferSchema.safeParse({ kind: 'food' }).success).toBe(true);
  });

  it('has no transport kind', () => {
    expect(helpOfferSchema.safeParse({ kind: 'transport' }).success).toBe(false);
  });

  it('moves only forward', () => {
    expect(nextOfferStatus('offered', 'accept')).toBe('accepted');
    expect(nextOfferStatus('offered', 'decline')).toBe('declined');
    expect(nextOfferStatus('accepted', 'withdraw')).toBe('withdrawn');
    expect(nextOfferStatus('accepted', 'decline')).toBeNull();
    expect(nextOfferStatus('declined', 'accept')).toBeNull();
    expect(nextOfferStatus('withdrawn', 'withdraw')).toBeNull();
  });
});

describe('central query', () => {
  it('needs both coordinates and a place to filter by distance', () => {
    expect(centralQuerySchema.safeParse({ latitude: '-1.4' }).success).toBe(false);
    expect(centralQuerySchema.safeParse({ radiusKm: '5' }).success).toBe(false);
    const ok = centralQuerySchema.parse({
      latitude: '-1.45',
      longitude: '-48.48',
      radiusKm: '5',
      withoutHelp: 'true',
    });
    expect(ok.withoutHelp).toBe(true);
    expect(ok.limit).toBe(50);
  });
});

describe('public distance', () => {
  it('rounds to half a kilometre and never shows zero', () => {
    expect(publicDistanceKm(30)).toBe(0.5);
    expect(publicDistanceKm(1240)).toBe(1);
    expect(publicDistanceKm(1260)).toBe(1.5);
  });
});
