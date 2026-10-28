import { describe, expect, it } from 'vitest';
import { belemToday, custodyChange, healthRecordSchemaAt } from './passport.js';

const now = new Date('2026-10-28T02:00:00Z'); // 27/10 23h em Belém

describe('health record', () => {
  const schema = healthRecordSchemaAt(now);

  it('uses the Belém calendar for today', () => {
    expect(belemToday(now)).toBe('2026-10-27');
  });

  it('accepts a vaccine with the next dose', () => {
    const parsed = schema.parse({
      kind: 'vaccine',
      title: 'V10',
      occurredOn: '2026-10-27',
      nextDueOn: '2027-10-27',
    });
    expect(parsed.visibility).toBe('caretakers');
  });

  it('refuses a date in the future of Belém', () => {
    const result = schema.safeParse({ kind: 'vaccine', title: 'V10', occurredOn: '2026-10-28' });
    expect(result.success).toBe(false);
  });

  it('refuses a next dose before the record', () => {
    const result = schema.safeParse({
      kind: 'vaccine',
      title: 'Antirrábica',
      occurredOn: '2026-10-01',
      nextDueOn: '2026-09-01',
    });
    expect(result.success).toBe(false);
  });

  it('refuses an impossible day', () => {
    const result = schema.safeParse({ kind: 'exam', title: 'Sangue', occurredOn: '2026-02-31' });
    expect(result.success).toBe(false);
  });
});

describe('custody', () => {
  it('opens the foster home when it leaves the rescuer', () => {
    expect(custodyChange('rescued', 'fostered')).toEqual({ close: ['rescue'], open: 'foster' });
  });

  it('closes the adoption on a return', () => {
    expect(custodyChange('adopted', 'for_adoption')).toEqual({ close: ['adoption'], open: null });
  });

  it('does nothing on the street steps', () => {
    expect(custodyChange('open', 'on_the_way')).toEqual({ close: [], open: null });
  });
});
