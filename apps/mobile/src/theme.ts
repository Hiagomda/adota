import { useColorScheme } from 'react-native';

export const palette = {
  accent: '#FF6B3D',
  white: '#FFFFFF',
  black: '#000000',
  ink: '#121212',
  high: '#E23B3B',
  medium: '#E0A100',
  low: '#1F8F4E',
};

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    background: dark ? palette.black : palette.white,
    surface: dark ? palette.ink : '#F4F4F4',
    text: dark ? '#F5F5F5' : '#111111',
    muted: dark ? '#B5B5B5' : '#5C5C5C',
    line: dark ? '#2A2A2A' : '#E6E6E6',
    accent: palette.accent,
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

export const nextStatus: Record<string, string | undefined> = {
  open: 'on_the_way',
  on_the_way: 'rescued',
  rescued: 'fostered',
  fostered: 'for_adoption',
  for_adoption: 'adopted',
};
