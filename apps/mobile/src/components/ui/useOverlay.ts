import { useEffect, useState } from 'react';
import { Easing, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion, useMotionDuration } from '../../theme';

/**
 * Keeps an overlay mounted while its exit animation runs.
 * `progress` goes 0 → 1 on open and 1 → 0 on close.
 */
export function useOverlay(visible: boolean) {
  const duration = useMotionDuration();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(visible);
  // Derived state: mount in the same render that asks to open.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: duration(motion.base), easing: Easing.out(Easing.cubic) });
      return;
    }
    progress.value = withTiming(
      0,
      { duration: duration(motion.fast), easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [visible, duration, progress]);

  return { mounted, progress };
}
