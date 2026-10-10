import { useCallback } from 'react';
import { Easing, useReducedMotion } from 'react-native-reanimated';

/** Returns a function that zeroes any duration when the system asks to reduce motion. */
export function useMotionDuration(): (ms: number) => number {
  const reduce = useReducedMotion();
  return useCallback((ms: number) => (reduce ? 0 : ms), [reduce]);
}

/** Easings: `out` for things that arrive, `inOut` for things that move, `bounce` for rewards. */
export const easing = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  bounce: Easing.out(Easing.back(1.8)),
} as const;

/** Delay between cards that enter one after another. */
export const STAGGER_MS = 60;
