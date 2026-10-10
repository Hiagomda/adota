import { describe, expect, it } from 'vitest';
import { canTransitionStatus, statusAfterLeavingHelp } from './domain.js';

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
});
