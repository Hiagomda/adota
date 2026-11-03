import { describe, expect, it } from 'vitest';
import {
  missingReason,
  openNeedKinds,
  planApplies,
  rescuePlan,
  type RescuePlanInput,
} from './rescuePlan.js';

const base: RescuePlanInput = {
  status: 'open',
  urgency: 'medium',
  healthNotes: null,
  goingCount: 0,
  offers: {},
  fosterStay: null,
  marks: {},
};

const states = (input: RescuePlanInput) =>
  Object.fromEntries(rescuePlan(input).map((need) => [need.kind, need.state]));

describe('rescue plan', () => {
  it('builds the plan from the case: calm cases skip the vet', () => {
    expect(states(base)).toEqual({ check_site: 'open', foster: 'open', food: 'open' });
    expect(states({ ...base, urgency: 'high' })).toHaveProperty('vet', 'open');
    expect(states({ ...base, healthNotes: 'Pata machucada' })).toHaveProperty('vet', 'open');
  });

  it('counts people going, accepted offers and Casa Amiga as covered', () => {
    const plan = states({
      ...base,
      urgency: 'high',
      goingCount: 2,
      offers: { vet: { offered: 1, accepted: 0 }, food: { offered: 2, accepted: 1 } },
      fosterStay: 'approved',
    });
    expect(plan).toEqual({
      check_site: 'covered',
      vet: 'offered',
      foster: 'covered',
      food: 'covered',
    });
  });

  it('shows a pending Casa Amiga request as offered', () => {
    expect(states({ ...base, fosterStay: 'requested' })).toHaveProperty('foster', 'offered');
  });

  it('lets whoever runs the case dismiss, resolve or add a need', () => {
    const plan = states({
      ...base,
      marks: { food: 'dismissed', foster: 'covered', supplies: 'needed', vet: 'needed' },
    });
    expect(plan).toEqual({
      check_site: 'open',
      vet: 'open',
      foster: 'covered',
      food: 'dismissed',
      supplies: 'open',
    });
  });

  it('includes an offer nobody planned for, so it is not lost', () => {
    expect(states({ ...base, offers: { supplies: { offered: 1, accepted: 0 } } })).toHaveProperty(
      'supplies',
      'offered',
    );
  });

  it('marks the street part done once the animal is rescued', () => {
    const plan = rescuePlan({ ...base, status: 'rescued' });
    expect(plan[0]).toMatchObject({ kind: 'check_site', state: 'covered' });
    expect(openNeedKinds(plan)).toEqual(['foster', 'food']);
  });

  it('only applies to rescues still in progress', () => {
    expect(planApplies('rescue_alert', 'not_found')).toBe(true);
    expect(planApplies('rescue_alert', 'rescued')).toBe(true);
    expect(planApplies('rescue_alert', 'fostered')).toBe(false);
    expect(planApplies('lost', 'open')).toBe(false);
  });

  it('explains what is missing in words', () => {
    expect(missingReason(['check_site'])).toBeNull();
    expect(missingReason(['vet'])).toBe('Falta veterinário');
    expect(missingReason(['check_site', 'vet', 'foster', 'food'])).toBe(
      'Falta veterinário, lar temporário e ração',
    );
  });
});
