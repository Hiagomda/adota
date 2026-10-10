import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { size as sizeTokens, useTheme } from '../../theme';

export type IconName = ComponentProps<typeof Feather>['name'];
export type IconSize = keyof typeof sizeTokens.icon;

/** The only icon set of the app (Feather). Decorative: hidden from screen readers. */
export function Icon({
  name,
  size = 'md',
  color,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <Feather
      name={name}
      size={sizeTokens.icon[size]}
      color={color ?? colors.text}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
