import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  motion,
  radius,
  size,
  spacing,
  STAGGER_MS,
  useMotionDuration,
  useTheme,
} from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tones';
import { Touchable } from './Touchable';

export interface ShortcutCardProps {
  label: string;
  icon: IconName;
  tone: Tone;
  /** Position in its row: cards rise one after another. */
  index?: number;
  onPress: () => void;
}

const ICON_CIRCLE = 48;

/** Big square shortcut: colored icon circle over a short label. Meant to sit in a row of four. */
export function ShortcutCard({ label, icon, tone, index = 0, onPress }: ShortcutCardProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const { background, foreground } = toneColors(colors, tone);
  return (
    <Animated.View
      entering={FadeInUp.delay(duration(index * STAGGER_MS)).duration(duration(motion.slow))}
      style={[styles.slot, shadows.md, { backgroundColor: colors.surfaceRaised }]}
    >
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={label}
        haptic="light"
        pressedScale={0.94}
        onPress={onPress}
        style={[styles.card, { backgroundColor: colors.surfaceRaised }]}
      >
        <View style={[styles.circle, { backgroundColor: background }]}>
          <Icon name={icon} size="lg" color={foreground} />
        </View>
        <AppText variant="caption" numberOfLines={2} style={styles.label}>
          {label}
        </AppText>
      </Touchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: { flex: 1, borderRadius: radius.xl },
  card: {
    minHeight: size.shortcut,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  circle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { textAlign: 'center' },
});
