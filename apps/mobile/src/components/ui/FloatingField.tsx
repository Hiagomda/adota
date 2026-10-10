import { useEffect, useState, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { radius, size, spacing, typography, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';

export interface FloatingFieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  error?: string;
  icon: IconName;
  /** Password fields get a show/hide control and block the context menu. */
  secret?: boolean;
  revealed?: boolean;
  onToggleSecret?: () => void;
  ref?: Ref<TextInput>;
}

const FIELD_HEIGHT = 64;

export function FloatingField({
  label,
  error,
  icon,
  secret = false,
  revealed = false,
  onToggleSecret,
  ref,
  value,
  editable = true,
  onFocus,
  onBlur,
  ...rest
}: FloatingFieldProps) {
  const { colors } = useTheme();
  const duration = useMotionDuration();
  const text = typeof value === 'string' ? value : '';
  const [focused, setFocused] = useState(false);
  const raised = focused || text.length > 0;
  const offset = useSharedValue(0);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;

  useEffect(() => {
    if (!error) return;
    const step = duration(40);
    if (step === 0) return;
    offset.value = withSequence(
      withTiming(-6, { duration: step }),
      withTiming(6, { duration: step }),
      withTiming(-3, { duration: step }),
      withTiming(0, { duration: step }),
    );
  }, [duration, error, offset]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.field,
          shake,
          {
            borderColor,
            backgroundColor: editable ? colors.surface : colors.surfaceMuted,
          },
        ]}
      >
        <Icon name={icon} color={error ? colors.errorText : colors.textSecondary} />
        <View style={styles.stack}>
          <AppText
            variant="caption"
            style={{ color: error ? colors.errorText : colors.textSecondary }}
          >
            {raised ? label : ''}
          </AppText>
          <TextInput
            {...rest}
            ref={ref}
            value={value}
            editable={editable}
            placeholder={raised ? undefined : label}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={label}
            secureTextEntry={secret && !revealed}
            contextMenuHidden={secret}
            autoCorrect={secret ? false : rest.autoCorrect}
            importantForAutofill="yes"
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            style={[styles.input, typography.body, { color: colors.text }]}
          />
        </View>
        {secret && onToggleSecret ? (
          <IconButton
            icon={revealed ? 'eye-off' : 'eye'}
            variant="ghost"
            accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={onToggleSecret}
          />
        ) : null}
      </Animated.View>
      {error ? (
        <View accessibilityLiveRegion="polite" style={styles.errorRow}>
          <Icon name="alert-circle" size="sm" color={colors.errorText} />
          <AppText variant="bodySmall" color="errorText" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  field: {
    minHeight: FIELD_HEIGHT,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stack: { flex: 1, justifyContent: 'center', minHeight: size.touch },
  input: { padding: 0, margin: 0, minHeight: size.touch },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  errorText: { flex: 1 },
});
