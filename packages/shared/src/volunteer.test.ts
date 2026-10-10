import { describe, expect, it } from 'vitest';
import { badgesForAction, levelForXp, pointsForVolunteerAction } from './volunteer.js';

describe('volunteer points', () => {
  it('scores each action from the server rules', () => {
    expect(pointsForVolunteerAction({ actionType: 'report' })).toBe(20);
    expect(pointsForVolunteerAction({ actionType: 'transport' })).toBe(0);
    expect(pointsForVolunteerAction({ actionType: 'foster', days: 3 })).toBe(300);
    expect(pointsForVolunteerAction({ actionType: 'donation', amountReais: 40 })).toBe(40);
    expect(pointsForVolunteerAction({ actionType: 'adoption' })).toBe(500);
  });

  it('names the level from the xp bands', () => {
    expect(levelForXp(0).name).toBe('Olheiro');
    expect(levelForXp(100).name).toBe('Olheiro');
    expect(levelForXp(101).name).toBe('Guardião local');
    expect(levelForXp(501).name).toBe('Protetor ativo');
    expect(levelForXp(2001).name).toBe('Anjo da guarda');
    expect(levelForXp(9000).progress).toBe(1);
  });

  it('unlocks the badge that matches the action', () => {
    expect(badgesForAction('report', 20)).toEqual(['neighborhood_scout']);
    expect(badgesForAction('transport', 150)).toEqual(['local_hero']);
    expect(badgesForAction('report', 120)).toContain('local_hero');
  });
});
