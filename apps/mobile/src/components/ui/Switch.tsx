import { StyleSheet, Switch as NativeSwitch, View } from 'react-native';
import { size, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Touchable } from './Touchable';

export interface SwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
}

/** A labelled row: the whole row toggles, the native switch is only the visual. */
export function Switch({ label, value, onValueChange, description, disabled = false }: SwitchProps) {
  const { colors } = useTheme();
  return (
    <Touchable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      haptic="light"
      pressedScale={0.99}
      onPress={() => onValueChange(!value)}
      style={styles.row}
    >
      <View style={styles.text}>
        <AppText color={disabled ? 'textDisabled' : 'text'}>{label}</AppText>
        {description ? (
          <AppText variant="bodySmall" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <NativeSwitch
          value={value}
          disabled={disabled}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.borderStrong}
        />
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: size.touch,
  },
  text: { flex: 1 },
});
