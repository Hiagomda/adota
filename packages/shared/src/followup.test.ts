import { describe, expect, it } from 'vitest';
import {
  checkinAnswerSchema,
  checkinNeedsAttention,
  checkinsToNotify,
  dueCheckinDays,
} from './followup.js';

const adopted = new Date('2026-10-01T12:00:00Z');
const at = (days: number) => new Date(adopted.getTime() + days * 86_400_000);

describe('adoption check-ins', () => {
  it('comes due at 7, 30 and 90 days', () => {
    expect(dueCheckinDays(adopted, at(6))).toEqual([]);
    expect(dueCheckinDays(adopted, at(7))).toEqual([7]);
    expect(dueCheckinDays(adopted, at(45))).toEqual([7, 30]);
    expect(dueCheckinDays(adopted, at(120))).toEqual([7, 30, 90]);
  });

  it('does not send a check-in that is too late', () => {
    expect(checkinsToNotify(adopted, at(10))).toEqual([7]);
    expect(checkinsToNotify(adopted, at(31))).toEqual([30]);
    expect(checkinsToNotify(adopted, at(200))).toEqual([]);
  });

  it('asks for attention when it is hard or the tutor wants help', () => {
    expect(checkinNeedsAttention({ mood: 'great', wantsHelp: false })).toBe(false);
    expect(checkinNeedsAttention({ mood: 'hard', wantsHelp: false })).toBe(true);
    expect(checkinNeedsAttention({ mood: 'ok', wantsHelp: true })).toBe(true);
    expect(checkinAnswerSchema.parse({ mood: 'ok' })).toEqual({ mood: 'ok', wantsHelp: false });
  });
});
