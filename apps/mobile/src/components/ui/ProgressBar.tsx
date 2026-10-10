import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { easing, motion, radius, spacing, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';

export interface ProgressBarProps {
  /** 0 to 1. */
  value: number;
  label?: string;
  /** Right-aligned text, for example "120 / 200 XP". */
  caption?: string;
  /** hero is for bars drawn over the turquoise header. */
  tone?: 'primary' | 'secondary' | 'caramel' | 'hero';
}

export function ProgressBar({ value, label, caption, tone = 'primary' }: ProgressBarProps) {
  const { colors } = useTheme();
  const duration = useMotionDuration();
  const clamped = Math.min(1, Math.max(0, value));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(clamped, {
      duration: duration(motion.slow),
      easing: easing.out,
    });
  }, [clamped, duration, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const onHero = tone === 'hero';
  const fillColor = onHero
    ? colors.heroAccent
    : tone === 'secondary'
      ? colors.secondary
      : tone === 'caramel'
        ? colors.caramel
        : colors.primary;
  const labelColor = onHero ? 'onHeroMuted' : 'textSecondary';

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progresso'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={styles.wrapper}
    >
      {label || caption ? (
        <View style={styles.header}>
          {label ? <AppText variant="bodySmallStrong" color={labelColor}>{label}</AppText> : <View />}
          {caption ? <AppText variant="caption" color={labelColor}>{caption}</AppText> : null}
        </View>
      ) : null}
      <View
        style={[styles.track, { backgroundColor: onHero ? colors.heroTrack : colors.surfaceMuted }]}
      >
        <Animated.View style={[styles.fill, { backgroundColor: fillColor }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  track: { height: 12, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
