import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Ellipse } from 'react-native-svg';
import { easing, useTheme } from '../../theme';

const PARTICLES = 6;
const DISTANCE = 44;
const PARTICLE_SIZE = 14;
const BURST_MS = 560;
const POP_MS = 110;

function Paw({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Ellipse cx="12" cy="16" rx="5.5" ry="4.5" fill={color} />
      <Ellipse cx="5.5" cy="10" rx="2.2" ry="2.8" fill={color} />
      <Ellipse cx="9.5" cy="5.5" rx="2.2" ry="2.8" fill={color} />
      <Ellipse cx="14.5" cy="5.5" rx="2.2" ry="2.8" fill={color} />
      <Ellipse cx="18.5" cy="10" rx="2.2" ry="2.8" fill={color} />
    </Svg>
  );
}

function Particle({
  index,
  progress,
  color,
}: {
  index: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const angle = (index / PARTICLES) * 2 * Math.PI - Math.PI / 2;
  const style = useAnimatedStyle(() => ({
    // Hidden at rest (0) and once the burst is over (1).
    opacity: progress.value === 0 ? 0 : 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * DISTANCE * progress.value },
      { translateY: Math.sin(angle) * DISTANCE * progress.value },
      { rotate: `${angle + Math.PI / 2}rad` },
      { scale: 1 - 0.4 * progress.value },
    ],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center, style]}>
      <Paw size={PARTICLE_SIZE} color={color} />
    </Animated.View>
  );
}

export interface PawBurstProps {
  /** Plays once each time this number changes; 0 never plays. */
  trigger: number;
  size?: number;
}

/**
 * Coral paw that pops and throws small paws around it, for the moments of heart (someone
 * said "vou ajudar"). It draws over its parent and never takes touches. The caller owns the
 * haptic, and nothing moves when the system asks to reduce motion.
 */
export function PawBurst({ trigger, size = 32 }: PawBurstProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pop = useSharedValue(1);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0 || reduce) return;
    pop.value = withSequence(
      withTiming(1.35, { duration: POP_MS, easing: easing.out }),
      withSpring(1, { damping: 7, stiffness: 240 }),
    );
    burst.value = 0;
    burst.value = withTiming(1, { duration: BURST_MS, easing: easing.out });
  }, [trigger, reduce, pop, burst]);

  const pawStyle = useAnimatedStyle(() => ({
    opacity: burst.value === 0 ? 0 : 1 - burst.value * burst.value,
    transform: [{ scale: pop.value }],
  }));
  const particleColors = [colors.secondary, colors.caramel, colors.primary];

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.center]}
    >
      {Array.from({ length: PARTICLES }, (_, index) => (
        <Particle
          key={index}
          index={index}
          progress={burst}
          color={particleColors[index % particleColors.length] ?? colors.secondary}
        />
      ))}
      <Animated.View style={pawStyle}>
        <Paw size={size} color={colors.secondary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
