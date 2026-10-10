import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { radius, size, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}

/** Field that looks like an Input and opens the options in a bottom sheet. */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Selecione',
  error,
  disabled = false,
}: SelectProps<T>) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View style={styles.wrapper}>
      <AppText variant="bodySmallStrong" color="textSecondary">
        {label}
      </AppText>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        pressedScale={0.99}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.error : colors.border,
            opacity: disabled ? 0.6 : 1,
          },
        ]}
      >
        <AppText color={selected ? 'text' : 'textSecondary'} style={styles.value} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </AppText>
        <Icon name="chevron-down" color={colors.textSecondary} />
      </Touchable>
      {error ? (
        <AppText variant="caption" color="errorText" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <Touchable
                key={option.value}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                haptic="light"
                pressedScale={0.99}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={styles.option}
              >
                <AppText style={styles.value} color={active ? 'primary' : 'text'}>
                  {option.label}
                </AppText>
                {active ? <Icon name="check" color={colors.primary} /> : null}
              </Touchable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    minHeight: size.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  value: { flex: 1 },
  option: {
    minHeight: size.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
});
