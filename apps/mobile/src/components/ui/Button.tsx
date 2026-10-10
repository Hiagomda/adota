import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, size, spacing, useTheme, type ColorRoles } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  /** Replaces the left icon. Used for marks that are not in the icon set, such as Google. */
  leading?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

interface ButtonColors {
  background: string;
  foreground: string;
  border: string;
}

function resolveColors(
  colors: ColorRoles,
  variant: ButtonVariant,
  pressed: boolean,
  disabled: boolean,
): ButtonColors {
  if (disabled) {
    return {
      background: variant === 'ghost' || variant === 'outline' ? 'transparent' : colors.surfaceMuted,
      foreground: colors.textDisabled,
      border: variant === 'outline' ? colors.border : 'transparent',
    };
  }
  switch (variant) {
    case 'primary':
      return {
        background: pressed ? colors.primaryPressed : colors.primary,
        foreground: colors.onPrimary,
        border: 'transparent',
      };
    case 'secondary':
      return {
        background: pressed ? colors.secondaryPressed : colors.secondary,
        foreground: colors.onSecondary,
        border: 'transparent',
      };
    case 'outline':
      return {
        background: pressed ? colors.primarySoft : 'transparent',
        foreground: colors.primary,
        border: colors.primary,
      };
    case 'ghost':
      return {
        background: pressed ? colors.primarySoft : 'transparent',
        foreground: colors.primary,
        border: 'transparent',
      };
    case 'destructive':
      return {
        background: colors.errorText,
        foreground: colors.textInverse,
        border: 'transparent',
      };
  }
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size: buttonSize = 'md',
  icon,
  iconPosition = 'left',
  leading,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { colors, shadows } = useTheme();
  const inactive = disabled || loading;
  const raised = !inactive && (variant === 'primary' || variant === 'secondary');
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      haptic={variant === 'primary' || variant === 'secondary' || variant === 'destructive' ? 'light' : false}
      onPress={onPress}
      style={({ pressed }) => {
        const palette = resolveColors(colors, variant, pressed, disabled);
        return [
          styles.base,
          buttonSize === 'lg' ? styles.large : styles.medium,
          fullWidth ? styles.full : null,
          raised ? shadows.sm : null,
          { backgroundColor: palette.background, borderColor: palette.border },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const { foreground } = resolveColors(colors, variant, pressed, disabled);
        return (
          <View style={styles.content}>
            {loading ? <ActivityIndicator size="small" color={foreground} /> : null}
            {!loading && leading ? leading : null}
            {!loading && !leading && icon && iconPosition === 'left' ? (
              <Icon name={icon} color={foreground} />
            ) : null}
            <AppText variant="button" style={{ color: foreground }} numberOfLines={1}>
              {title}
            </AppText>
            {!loading && icon && iconPosition === 'right' ? (
              <Icon name={icon} color={foreground} />
            ) : null}
          </View>
        );
      }}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  medium: { minHeight: size.control },
  large: { minHeight: size.control + spacing.sm, paddingHorizontal: spacing.xxl },
  full: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
