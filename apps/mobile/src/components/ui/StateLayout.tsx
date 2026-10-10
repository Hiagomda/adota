import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Mascot, type MascotPose } from '../../mascot';
import { motion, radius, size, spacing, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';
import { MarajoaraPattern } from './MarajoaraPattern';

export interface StateLayoutProps {
  pose: MascotPose;
  title: string;
  body: string;
  action?: ReactNode;
  /** Row version for blocks inside a screen; the default fills a whole screen. */
  compact?: boolean;
  alert?: boolean;
}

const COMPACT_MASCOT = 88;
const PATTERN_OPACITY = 0.1;

/** Shared frame of the empty and error states: mascot, text and action on a textured panel. */
export function StateLayout({ pose, title, body, action, compact = false, alert = false }: StateLayoutProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  return (
    <Animated.View
      entering={FadeInDown.duration(duration(motion.slow))}
      accessibilityRole={alert ? 'alert' : undefined}
      style={compact ? styles.compactOuter : styles.outer}
    >
      <View style={[shadows.sm, styles.shadow, { backgroundColor: colors.surfaceRaised }]}>
        <View style={styles.panel}>
          <MarajoaraPattern color={colors.primary} opacity={PATTERN_OPACITY} />
          <View style={compact ? styles.compactBody : styles.body}>
            <Mascot pose={pose} size={compact ? COMPACT_MASCOT : size.mascot} />
            <View style={compact ? styles.compactText : styles.text}>
              <AppText variant={compact ? 'h3' : 'h2'} style={compact ? undefined : styles.center}>
                {title}
              </AppText>
              <AppText
                variant={compact ? 'bodySmall' : 'body'}
                color="textSecondary"
                style={compact ? undefined : styles.center}
              >
                {body}
              </AppText>
              {action ? <View style={styles.action}>{action}</View> : null}
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: { padding: spacing.xl },
  compactOuter: { paddingHorizontal: spacing.lg },
  shadow: { borderRadius: radius.xxl },
  panel: { borderRadius: radius.xxl, overflow: 'hidden' },
  body: { padding: spacing.xxl, gap: spacing.sm, alignItems: 'center' },
  compactBody: { padding: spacing.lg, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  text: { gap: spacing.sm, alignItems: 'center' },
  compactText: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  center: { textAlign: 'center' },
  action: { paddingTop: spacing.sm },
});
