import { Text, type TextProps } from 'react-native';
import { typography, useTheme, type ColorRoles, type TypographyVariant } from '../../theme';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: keyof ColorRoles;
}

export function AppText({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const isTitle = variant === 'display' || variant === 'h1' || variant === 'h2' || variant === 'h3';
  return (
    <Text
      accessibilityRole={isTitle ? 'header' : rest.accessibilityRole}
      {...rest}
      style={[typography[variant], { color: colors[color] }, style]}
    />
  );
}
