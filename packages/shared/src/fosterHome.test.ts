import { describe, expect, it } from 'vitest';
import { fosterHomeSettingsSchema, fosterStayTransition, freeSlots } from './fosterHome.js';

describe('foster home settings', () => {
  const base = {
    isFosterAvailable: true,
    fosterPetTypes: ['dog'],
    fosterSizes: ['small'],
    fosterMaxDays: 15,
    capacity: 2,
    acceptsSpecialNeeds: false,
    offers: ['food'],
    serviceRadiusKm: 10,
  };

  it('accepts a complete home', () => {
    expect(fosterHomeSettingsSchema.safeParse(base).success).toBe(true);
  });

  it('asks for sizes when the home is open', () => {
    const result = fosterHomeSettingsSchema.safeParse({ ...base, fosterSizes: [] });
    expect(result.success).toBe(false);
  });

  it('refuses transport, which the app does not offer', () => {
    const result = fosterHomeSettingsSchema.safeParse({ ...base, offers: ['transport'] });
    expect(result.success).toBe(false);
  });

  it('lets a closed home keep empty choices', () => {
    const result = fosterHomeSettingsSchema.safeParse({
      ...base,
      isFosterAvailable: false,
      fosterPetTypes: [],
      fosterSizes: [],
      fosterMaxDays: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('foster stay', () => {
  it('only the home approves', () => {
    expect(fosterStayTransition('requested', 'approve', 'foster')).toBe('approved');
    expect(fosterStayTransition('requested', 'approve', 'requester')).toBeNull();
  });

  it('the requester cancels, the home declines', () => {
    expect(fosterStayTransition('requested', 'cancel', 'requester')).toBe('cancelled');
    expect(fosterStayTransition('requested', 'cancel', 'foster')).toBeNull();
    expect(fosterStayTransition('requested', 'decline', 'foster')).toBe('declined');
  });

  it('either side ends a stay and nothing reopens a finished one', () => {
    expect(fosterStayTransition('approved', 'end', 'requester')).toBe('ended');
    expect(fosterStayTransition('approved', 'end', 'foster')).toBe('ended');
    expect(fosterStayTransition('ended', 'approve', 'team')).toBeNull();
  });

  it('never shows negative slots', () => {
    expect(freeSlots(1, 3)).toBe(0);
    expect(freeSlots(3, 1)).toBe(2);
  });
});
