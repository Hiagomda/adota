import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { radius, size, useTheme } from '../../theme';
import { Icon, type IconName, type IconSize } from './Icon';
import { Touchable } from './Touchable';

export interface IconButtonProps {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
  /** glass sits over photos, hero over the turquoise header. */
  variant?: 'ghost' | 'tonal' | 'filled' | 'glass' | 'hero';
  iconSize?: IconSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'ghost',
  iconSize = 'lg',
  disabled = false,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const foreground = disabled
    ? colors.textDisabled
    : variant === 'filled'
      ? colors.onPrimary
      : variant === 'tonal'
        ? colors.onPrimarySoft
        : variant === 'glass'
          ? colors.onMedia
          : variant === 'hero'
            ? colors.onHero
            : colors.text;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic="light"
      onPress={onPress}
      pressedScale={0.92}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor:
            variant === 'filled'
              ? pressed
                ? colors.primaryPressed
                : colors.primary
              : variant === 'tonal'
                ? colors.primarySoft
                : variant === 'glass'
                  ? colors.mediaScrim
                  : variant === 'hero'
                    ? colors.heroGlass
                    : pressed
                      ? colors.surfaceMuted
                      : 'transparent',
        },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={foreground} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
