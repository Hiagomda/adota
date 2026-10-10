import { StyleSheet, View } from 'react-native';
import { radius, size, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}

export function Checkbox({ label, checked, onChange, description, disabled = false }: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <Touchable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      haptic="light"
      pressedScale={0.98}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: checked ? colors.primary : colors.surface,
            borderColor: checked ? colors.primary : colors.borderStrong,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {checked ? <Icon name="check" size="sm" color={colors.onPrimary} /> : null}
      </View>
      <View style={styles.text}>
        <AppText color={disabled ? 'textDisabled' : 'text'}>{label}</AppText>
        {description ? (
          <AppText variant="bodySmall" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
