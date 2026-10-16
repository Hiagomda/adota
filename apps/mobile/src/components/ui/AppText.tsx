import { Text, type TextProps } from 'react-native';
import { typography, useTheme, type ColorRoles, type TypographyVariant } from '../../theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: keyof ColorRoles;
}

/**
 * How far big titles follow the system font size. Body text follows it all the way; a 44 px
 * number at twice the size would push everything else off the screen.
 */
const fontScaleCap: Partial<Record<TypographyVariant, number>> = {
  stat: 1.3,
  display: 1.3,
  h1: 1.5,
  h2: 1.6,
};

export function AppText({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const isTitle = variant === 'display' || variant === 'h1' || variant === 'h2' || variant === 'h3';
  return (
    <Text
      accessibilityRole={isTitle ? 'header' : rest.accessibilityRole}
      maxFontSizeMultiplier={fontScaleCap[variant]}
      {...rest}
      style={[typography[variant], { color: colors[color] }, style]}
    />
  );
}
