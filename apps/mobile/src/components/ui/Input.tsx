import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, size, spacing, typography, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  helper?: string;
  /** Inline validation message. Replaces the helper text while present. */
  error?: string;
  leftIcon?: IconName;
  ref?: Ref<TextInput>;
}

export function Input({
  label,
  helper,
  error,
  leftIcon,
  editable = true,
  multiline,
  ref,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.error
    : focused
      ? colors.primary
      : colors.border;
  return (
    <View style={styles.wrapper}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <View
        style={[
          styles.field,
          multiline ? styles.multiline : null,
          {
            borderColor,
            backgroundColor: editable ? colors.surface : colors.surfaceMuted,
          },
        ]}
      >
        {leftIcon ? <Icon name={leftIcon} color={colors.textSecondary} /> : null}
        <TextInput
          {...rest}
          ref={ref}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
          // Placeholders are text to read: secondary (AA), not the disabled gray.
          placeholderTextColor={colors.textSecondary}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            typography.body,
            { color: editable ? colors.text : colors.textDisabled },
            multiline ? styles.inputMultiline : null,
          ]}
        />
      </View>
      {error ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size="sm" color={colors.errorText} />
          <AppText variant="bodySmall" color="errorText" style={styles.messageText}>
            {error}
          </AppText>
        </View>
      ) : helper ? (
        <AppText variant="bodySmall" color="textSecondary">
          {helper}
        </AppText>
      ) : null}
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
    borderWidth: 1.5,
    borderRadius: radius.md,
  },
  multiline: { alignItems: 'flex-start', minHeight: 112, paddingTop: spacing.md },
  input: { flex: 1, paddingVertical: spacing.sm },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  message: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messageText: { flex: 1 },
});
