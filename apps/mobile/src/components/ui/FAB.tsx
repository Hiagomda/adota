import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export interface FABProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  /** With a label the button becomes a wide pill. */
  label?: string;
  /** Position is the caller's job (`position: 'absolute'` and offsets). */
  style?: StyleProp<ViewStyle>;
}

export function FAB({ icon, accessibilityLabel, onPress, label, style }: FABProps) {
  const { colors, shadows } = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      haptic="medium"
      pressedScale={0.94}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        label ? styles.extended : styles.round,
        shadows.lg,
        { backgroundColor: pressed ? colors.secondaryPressed : colors.secondary },
        style,
      ]}
    >
      <Icon name={icon} size="lg" color={colors.onSecondary} />
      {label ? (
        <AppText variant="button" color="onSecondary">
          {label}
        </AppText>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  fab: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
  },
  round: { width: 56 },
  extended: { paddingHorizontal: spacing.xl },
});
