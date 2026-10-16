import { useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, size, spacing, typography, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/** About five lines of body text before the chat box scrolls. */
const CHAT_MAX_HEIGHT = 120;

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  helper?: string;
  /** Inline validation message. Replaces the helper text while present. */
  error?: string;
  leftIcon?: IconName;
  /** chat: no visible label (screen readers still get it) and a box that starts at one line and grows. */
  variant?: 'field' | 'chat';
  ref?: Ref<TextInput>;
}

export function Input({
  label,
  helper,
  error,
  leftIcon,
  editable = true,
  multiline,
  variant = 'field',
  ref,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const chat = variant === 'chat';
  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;
  return (
    <View style={styles.wrapper}>
      {chat ? null : (
        <AppText variant="caption" color="textSecondary">
          {label}
        </AppText>
      )}
      <View
        style={[
          styles.field,
          multiline && !chat ? styles.multiline : null,
          chat ? styles.chatField : null,
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
            multiline && !chat ? styles.inputMultiline : null,
            chat ? styles.chatInput : null,
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
  chatField: { borderRadius: radius.lg, paddingHorizontal: spacing.md },
  chatInput: { maxHeight: CHAT_MAX_HEIGHT },
  message: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messageText: { flex: 1 },
});
