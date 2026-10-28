import { describe, expect, it } from 'vitest';
import {
  communityEventSchemaAt,
  eventListQuerySchema,
  eventUpdateSchemaAt,
  eventWindow,
  neighborhoodFromPlace,
  spotsLeft,
} from './events.js';

const now = new Date('2026-10-28T02:00:00Z'); // 27/10 23h em Belém

const base = {
  title: 'Mutirão de castração no Guamá',
  placeLabel: 'Praça do Guamá · Guamá · Belém',
  latitude: -1.46,
  longitude: -48.47,
  startsAt: '2026-11-07T08:00:00-03:00',
  endsAt: '2026-11-07T14:00:00-03:00',
};

describe('community event', () => {
  const schema = communityEventSchemaAt(now);

  it('defaults to an adoption fair without limit, like the old fairs', () => {
    const parsed = schema.parse(base);
    expect(parsed.category).toBe('adoption_fair');
    expect(parsed.capacity).toBeUndefined();
  });

  it('keeps capacity and drops repeated needs', () => {
    const parsed = schema.parse({
      ...base,
      category: 'neutering',
      capacity: 40,
      needs: ['volunteers', 'volunteers', 'vets'],
    });
    expect(parsed.needs).toEqual(['volunteers', 'vets']);
    expect(parsed.capacity).toBe(40);
  });

  it('refuses transport as a need and unknown fields', () => {
    expect(schema.safeParse({ ...base, needs: ['transport'] }).success).toBe(false);
    expect(schema.safeParse({ ...base, price: 10 }).success).toBe(false);
  });

  it('refuses an event that lasts days or is too far away', () => {
    expect(schema.safeParse({ ...base, endsAt: '2026-11-08T14:00:00-03:00' }).success).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        startsAt: '2027-06-01T08:00:00-03:00',
        endsAt: '2027-06-01T10:00:00-03:00',
      }).success,
    ).toBe(false);
  });
});

describe('event update', () => {
  const schema = eventUpdateSchemaAt(now);

  it('needs the version and both ends of the range', () => {
    expect(schema.safeParse({ title: 'Outro nome' }).success).toBe(false);
    expect(schema.safeParse({ version: 2, startsAt: base.startsAt }).success).toBe(false);
    expect(schema.safeParse({ version: 2, title: 'Outro nome' }).success).toBe(true);
  });

  it('lets the organizer remove the limit', () => {
    expect(schema.parse({ version: 1, capacity: null }).capacity).toBeNull();
  });
});

describe('event window in Belém time', () => {
  it('counts today from midnight in Belém, not UTC', () => {
    const window = eventWindow({ period: 'today' }, now);
    expect(window.from?.toISOString()).toBe('2026-10-27T03:00:00.000Z');
    expect(window.to?.toISOString()).toBe('2026-10-28T03:00:00.000Z');
  });

  it('turns a calendar month into its instants', () => {
    const window = eventWindow({ period: 'upcoming', month: '2026-12' }, now);
    expect(window.from?.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(window.to?.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('marks the past period', () => {
    expect(eventWindow({ period: 'past' }, now).past).toBe(true);
  });

  it('parses the filters from a query string', () => {
    const query = eventListQuerySchema.parse({
      latitude: '-1.4',
      longitude: '-48.4',
      radiusKm: '5',
    });
    expect(query.period).toBe('upcoming');
    expect(query.radiusKm).toBe(5);
    expect(eventListQuerySchema.safeParse({ month: '2026-13' }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('finds the neighborhood in the place name', () => {
    expect(neighborhoodFromPlace('Praça do Guamá · Guamá · Belém')).toBe('Guamá');
    expect(neighborhoodFromPlace('Marco, Belém')).toBe('Marco');
    expect(neighborhoodFromPlace('Rua dos Mundurucus, 1200, Batista Campos, Belém')).toBe(
      'Batista Campos',
    );
    expect(neighborhoodFromPlace('Bosque Rodrigues Alves')).toBeNull();
  });

  it('counts spots left', () => {
    expect(spotsLeft(10, 4)).toBe(6);
    expect(spotsLeft(10, 12)).toBe(0);
    expect(spotsLeft(null, 50)).toBeNull();
  });
});
