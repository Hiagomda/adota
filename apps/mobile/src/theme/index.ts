import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  makeShadows,
  type ColorRoles,
  type Shadow,
} from './tokens';

export * from './tokens';
export { appFonts } from './fonts';
export { easing, STAGGER_MS, useMotionDuration } from './motion';

export interface Theme {
  dark: boolean;
  colors: ColorRoles;
  shadows: Record<'sm' | 'md' | 'lg', Shadow>;
}

function buildTheme(dark: boolean): Theme {
  const colors = dark ? darkColors : lightColors;
  return { dark, colors, shadows: makeShadows(colors.shadow) };
}

const lightTheme = buildTheme(false);
const darkTheme = buildTheme(true);

export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  return useMemo(() => (dark ? darkTheme : lightTheme), [dark]);
}

export const statusLabel: Record<string, string> = {
  open: 'Aberto',
  on_the_way: 'A caminho',
  rescued: 'Resgatado',
  fostered: 'Lar temporário',
  for_adoption: 'Para adoção',
  adopted: 'Adotado',
};

export const urgencyLabel: Record<string, string> = {
  high: 'Urgente',
  medium: 'Atenção',
  low: 'Pode esperar',
};

export const nextStatus: Record<string, string | undefined> = {
  open: 'on_the_way',
  on_the_way: 'rescued',
  rescued: 'fostered',
  fostered: 'for_adoption',
  for_adoption: 'adopted',
};
