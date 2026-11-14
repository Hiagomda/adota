import { Platform, StyleSheet } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  /** Long text (quick suggestions): wraps over a few lines instead of staying one line. */
  multiline?: boolean;
}

const MULTILINE_MAX_WIDTH = 240;

/**
 * Chip de filtro ou escolha. No celular tem 40 px mais 4 px de hitSlop em cima e embaixo (alvo de
 * 48 px). O app web do iPhone ignora o hitSlop, então lá o próprio chip tem 44 px.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  disabled = false,
  multiline = false,
}: ChipProps) {
  const { colors } = useTheme();
  const foreground = disabled ? colors.textDisabled : selected ? colors.onPrimary : colors.text;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      haptic="light"
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        multiline ? styles.multiline : null,
        {
          backgroundColor: selected
            ? colors.primary
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {icon ? <Icon name={icon} size="sm" color={foreground} /> : null}
      <AppText
        variant="bodySmallStrong"
        numberOfLines={multiline ? 3 : 1}
        style={[styles.label, { color: foreground }]}
      >
        {label}
      </AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: Platform.OS === 'web' ? 44 : 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  multiline: {
    maxWidth: MULTILINE_MAX_WIDTH,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  label: { flexShrink: 1 },
});
