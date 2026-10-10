import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius as radiusTokens, spacing, useTheme } from '../../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: keyof typeof radiusTokens;
}

/** Placeholder block with a soft pulse. Static when the system asks to reduce motion. */
export function Skeleton({ width = '100%', height, radius = 'md' }: SkeletonProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse, reduce]);

  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radiusTokens[radius], backgroundColor: colors.surfaceMuted },
        animated,
      ]}
    />
  );
}

/** Feed card placeholder: header, photo, two lines. */
export function SkeletonCard() {
  return (
    <View accessible accessibilityLabel="Carregando" style={styles.card}>
      <View style={styles.head}>
        <Skeleton width={40} height={40} radius="pill" />
        <View style={styles.headText}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="30%" height={12} />
        </View>
      </View>
      <Skeleton height={320} radius="lg" />
      <Skeleton width="80%" height={14} />
      <Skeleton width="60%" height={14} />
    </View>
  );
}

/** Horizontal carousel placeholder: cards of the same size as the real ones. */
export function SkeletonRail({
  width,
  height,
  count = 3,
}: {
  width: number;
  height: number;
  count?: number;
}) {
  return (
    <View accessible accessibilityLabel="Carregando" style={styles.rail}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width={width} height={height} radius="xl" />
      ))}
    </View>
  );
}

/** List row placeholders. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <View accessible accessibilityLabel="Carregando" style={styles.rows}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={72} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: spacing.sm },
  rows: { padding: spacing.lg, gap: spacing.md },
  rail: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, overflow: 'hidden' },
});
