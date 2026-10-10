import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tones';
import { Touchable } from './Touchable';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Required when the card is tappable. */
  accessibilityLabel?: string;
  padding?: 'none' | 'md' | 'lg';
  elevation?: 'none' | 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  accessibilityLabel,
  padding = 'lg',
  elevation = 'sm',
  style,
}: CardProps) {
  const { colors, shadows } = useTheme();
  // The shadow lives on the outer view and the clipping on the inner one: on iOS a view that
  // clips its content also clips its own shadow.
  // Android only draws an elevation shadow for a view that has a background of its own.
  const outer = [
    styles.outer,
    elevation === 'none' ? null : shadows[elevation],
    { backgroundColor: colors.surfaceRaised },
  ];
  const inner = [
    styles.card,
    padding === 'none' ? null : { padding: padding === 'md' ? spacing.md : spacing.lg },
    { backgroundColor: colors.surfaceRaised },
    style,
  ];
  if (!onPress) {
    return (
      <View style={outer}>
        <View style={inner}>{children}</View>
      </View>
    );
  }
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      pressedScale={0.985}
      onPress={onPress}
      style={outer}
    >
      <View style={inner}>{children}</View>
    </Touchable>
  );
}

/** Number with a caption, for volunteer counters and XP. */
export function StatCard({
  value,
  label,
  icon,
  tone = 'primary',
}: {
  value: string | number;
  label: string;
  icon?: IconName;
  tone?: Tone;
}) {
  const { colors } = useTheme();
  const { background, foreground } = toneColors(colors, tone);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.stat, { backgroundColor: background }]}
    >
      {icon ? <Icon name={icon} color={foreground} /> : null}
      <AppText variant="display" style={{ color: foreground }}>
        {value}
      </AppText>
      <AppText variant="caption" style={{ color: foreground }}>
        {label}
      </AppText>
    </View>
  );
}

/** Large tappable card with an icon, a title and a hint: the main call to action of a block. */
export function ActionCard({
  title,
  description,
  icon,
  onPress,
  tone = 'secondary',
}: {
  title: string;
  description?: string;
  icon: IconName;
  onPress: () => void;
  tone?: Tone;
}) {
  const { colors } = useTheme();
  const { background, foreground } = toneColors(colors, tone);
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      haptic="light"
      pressedScale={0.98}
      onPress={onPress}
      style={[styles.action, { backgroundColor: background }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size="lg" color={foreground} />
      </View>
      <View style={styles.actionText}>
        <AppText variant="h3" style={{ color: foreground }}>
          {title}
        </AppText>
        {description ? (
          <AppText variant="bodySmall" style={{ color: foreground }}>
            {description}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-right" color={foreground} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radius.xl },
  card: { borderRadius: radius.xl, overflow: 'hidden' },
  stat: {
    flex: 1,
    minHeight: 104,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  action: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1, gap: spacing.xs },
});
