import { describe, expect, it } from 'vitest';
import {
  canTransitionStatus,
  ownerOnlyStatus,
  selfAdoption,
  statusAfterLeavingHelp,
} from './domain.js';

describe('rescue status', () => {
  it('lets the last helper step back from on the way', () => {
    expect(statusAfterLeavingHelp('on_the_way', 'could_not', 0)).toBe('open');
    expect(statusAfterLeavingHelp('on_the_way', 'not_found', 0)).toBe('not_found');
    expect(statusAfterLeavingHelp('on_the_way', 'could_not', 1)).toBeNull();
    expect(statusAfterLeavingHelp('rescued', 'not_found', 0)).toBeNull();
  });

  it('allows reopening a rescue that was not found', () => {
    expect(canTransitionStatus('on_the_way', 'open')).toBe(true);
    expect(canTransitionStatus('on_the_way', 'not_found')).toBe(true);
    expect(canTransitionStatus('not_found', 'open')).toBe(true);
    expect(canTransitionStatus('not_found', 'on_the_way')).toBe(true);
    expect(canTransitionStatus('adopted', 'open')).toBe(false);
  });

  it('lets the author mark an open or not found rescue as safe, and only the author', () => {
    expect(canTransitionStatus('open', 'rescued')).toBe(true);
    expect(canTransitionStatus('not_found', 'rescued')).toBe(true);
    expect(ownerOnlyStatus('open', 'rescued')).toBe(true);
    expect(ownerOnlyStatus('not_found', 'rescued')).toBe(true);
    expect(ownerOnlyStatus('on_the_way', 'rescued')).toBe(false);
    expect(ownerOnlyStatus('open', 'on_the_way')).toBe(false);
  });

  it('lets whoever found the animal say where it stays', () => {
    for (const to of ['rescued', 'fostered', 'for_adoption', 'adopted'] as const) {
      expect(canTransitionStatus('on_the_way', to)).toBe(true);
      expect(ownerOnlyStatus('on_the_way', to)).toBe(false);
      expect(ownerOnlyStatus('open', to)).toBe(true);
      expect(ownerOnlyStatus('not_found', to)).toBe(true);
    }
  });

  it('lets a foster keep the animal and an adoption pause or come back', () => {
    expect(canTransitionStatus('rescued', 'adopted')).toBe(true);
    expect(canTransitionStatus('fostered', 'adopted')).toBe(true);
    expect(canTransitionStatus('for_adoption', 'fostered')).toBe(true);
    expect(canTransitionStatus('adopted', 'for_adoption')).toBe(true);
    expect(ownerOnlyStatus('for_adoption', 'fostered')).toBe(true);
    expect(ownerOnlyStatus('adopted', 'for_adoption')).toBe(true);
    expect(ownerOnlyStatus('fostered', 'adopted')).toBe(false);
  });

  it('tells keeping the animal apart from a stranger adopting it', () => {
    expect(selfAdoption('on_the_way', 'adopted')).toBe(true);
    expect(selfAdoption('fostered', 'adopted')).toBe(true);
    expect(selfAdoption('for_adoption', 'adopted')).toBe(false);
    expect(selfAdoption('fostered', 'for_adoption')).toBe(false);
  });
});
