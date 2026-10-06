import { useColorScheme } from 'react-native';

export const palette = {
  acai: '#173B3F',
  tucuma: '#F7B84B',
  caju: '#F26B4F',
  areia: '#F3E8D2',
  accent: '#F26B4F',
  onAccent: '#173B3F',
  white: '#FFFFFF',
  black: '#000000',
  ink: '#173B3F',
  high: '#E23B3B',
  medium: '#E0A100',
  low: '#1F8F4E',
  tabInactive: '#9BA397',
};

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    background: dark ? palette.acai : palette.areia,
    surface: dark ? '#21494D' : '#FFF8EE',
    text: dark ? palette.areia : palette.acai,
    muted: dark ? '#C9D4C6' : '#4E6468',
    line: dark ? '#2E5659' : '#E4D4B8',
    accent: palette.caju,
    highlight: palette.tucuma,
    onAccent: palette.acai,
    tabBar: palette.acai,
    tabInactive: palette.tabInactive,
  };
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

export const contentMaxWidth = 560;

export const screenColumn = {
  width: '100%' as const,
  maxWidth: contentMaxWidth,
  alignSelf: 'center' as const,
};

export const nextStatus: Record<string, string | undefined> = {
  open: 'on_the_way',
  on_the_way: 'rescued',
  rescued: 'fostered',
  fostered: 'for_adoption',
  for_adoption: 'adopted',
};
