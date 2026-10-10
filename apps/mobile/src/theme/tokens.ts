/**
 * Design tokens of Égua, adota!. Screens never use raw values: they read from here.
 * Contrast notes (WCAG AA, 4.5:1 for text): white on `primary` is 5.1:1, `ink` on `coral` is 4.9:1.
 * White on coral is only 3.0:1, so every coral surface uses dark text.
 */

export const scale = {
  turquoise: {
    50: '#E8F5F5',
    100: '#C9E8E8',
    200: '#9DD3D3',
    300: '#6FBBBB',
    400: '#43A0A0',
    500: '#1F7A7A',
    600: '#1A6767',
    700: '#155353',
    800: '#0F3F3F',
    900: '#0A2B2B',
  },
  coral: {
    50: '#FEF0EC',
    100: '#FDDDD4',
    200: '#FAB9A8',
    300: '#F79680',
    400: '#F47E63',
    500: '#F26B4E',
    600: '#D9553A',
    700: '#B3422C',
    800: '#8A3220',
    900: '#5E2115',
  },
  caramel: {
    100: '#F6E4CE',
    500: '#D98A3D',
    700: '#A8661F',
  },
} as const;

const ink = '#1B2B2B';

export interface ColorRoles {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textDisabled: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimarySoft: string;
  onPrimary: string;
  secondary: string;
  secondaryPressed: string;
  secondarySoft: string;
  onSecondarySoft: string;
  onSecondary: string;
  caramel: string;
  caramelSoft: string;
  onCaramelSoft: string;
  success: string;
  successSoft: string;
  onSuccessSoft: string;
  warning: string;
  warningSoft: string;
  onWarningSoft: string;
  error: string;
  errorSoft: string;
  onErrorSoft: string;
  info: string;
  infoSoft: string;
  onInfoSoft: string;
  /** Error text on the page background, darker than `error` to pass AA. */
  errorText: string;
  overlay: string;
  /** Icons and text drawn over photos: white in both themes. */
  onMedia: string;
  /** Translucent white for tracks and separators over photos. */
  onMediaMuted: string;
  /** Full-screen photo viewers and camera: black in both themes. */
  mediaBackground: string;
  /** Dark gradient-less scrim behind text drawn over a photo. */
  mediaScrim: string;
  focusRing: string;
  tabBar: string;
  tabBarInactive: string;
  shadow: string;
  /** Header gradient, from the top-left corner to the bottom-right one. */
  heroStart: string;
  heroEnd: string;
  /** Text and icons over the hero gradient. */
  onHero: string;
  onHeroMuted: string;
  /** Empty part of progress bars and borders of glass chips over the hero. */
  heroTrack: string;
  /** Fill of the XP bar over the hero. */
  heroAccent: string;
  /** Soft veil behind icons that sit over the hero. */
  heroGlass: string;
  /** Solid color of the dark gradient laid over animal photos (fades from transparent). */
  photoScrim: string;
}

export const lightColors: ColorRoles = {
  background: '#FFF8EE',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F6EEDF',
  border: '#E8DDCB',
  borderStrong: '#CFC3AE',
  text: ink,
  textSecondary: '#5B6B6B',
  textDisabled: '#9AA8A8',
  textInverse: '#FFFFFF',
  primary: scale.turquoise[500],
  primaryPressed: scale.turquoise[700],
  primarySoft: scale.turquoise[50],
  onPrimarySoft: scale.turquoise[800],
  onPrimary: '#FFFFFF',
  secondary: scale.coral[500],
  // Lighter on press: dark text on coral 600 would drop to 3.7:1.
  secondaryPressed: scale.coral[400],
  secondarySoft: scale.coral[50],
  onSecondarySoft: scale.coral[700],
  onSecondary: ink,
  caramel: scale.caramel[500],
  caramelSoft: scale.caramel[100],
  onCaramelSoft: '#7A4A10',
  success: '#2E9E6B',
  successSoft: '#E3F5EC',
  onSuccessSoft: '#1B6B47',
  warning: '#F2A93B',
  warningSoft: '#FDF0DA',
  onWarningSoft: '#8A5A0B',
  error: '#D64545',
  errorSoft: '#FBE7E7',
  onErrorSoft: '#A82E2E',
  info: '#2A64AE',
  infoSoft: '#E4EEFA',
  onInfoSoft: '#1F4E8C',
  errorText: '#B03030',
  overlay: 'rgba(11, 31, 31, 0.5)',
  onMedia: '#FFFFFF',
  onMediaMuted: 'rgba(255, 255, 255, 0.3)',
  mediaBackground: '#000000',
  mediaScrim: 'rgba(0, 0, 0, 0.5)',
  focusRing: scale.turquoise[500],
  tabBar: '#FFFFFF',
  tabBarInactive: '#5B6B6B',
  shadow: '#0B1F1F',
  heroStart: scale.turquoise[500],
  heroEnd: scale.turquoise[800],
  onHero: '#FFFFFF',
  onHeroMuted: '#EAF7F7',
  heroTrack: 'rgba(255, 255, 255, 0.22)',
  heroAccent: '#FFD9A0',
  heroGlass: 'rgba(255, 255, 255, 0.16)',
  photoScrim: '#081616',
};

export const darkColors: ColorRoles = {
  background: '#0E1616',
  surface: '#152020',
  surfaceRaised: '#1B2A2A',
  surfaceMuted: '#223333',
  border: '#2B3F3F',
  borderStrong: '#3D5656',
  text: '#F1F6F4',
  textSecondary: '#A8BAB8',
  textDisabled: '#5F7473',
  textInverse: '#0E1616',
  primary: '#4DB6B6',
  primaryPressed: '#6FC6C6',
  primarySoft: '#14393A',
  onPrimarySoft: '#8FD6D6',
  onPrimary: '#0A2B2B',
  secondary: '#FF8A70',
  secondaryPressed: '#FFA08A',
  secondarySoft: '#3A1E17',
  onSecondarySoft: '#FFB19F',
  onSecondary: ink,
  caramel: '#E8A25B',
  caramelSoft: '#3B2A17',
  onCaramelSoft: '#F0C08A',
  success: '#4CC38A',
  successSoft: '#16372A',
  onSuccessSoft: '#7DD9AE',
  warning: '#F5B957',
  warningSoft: '#3D2F12',
  onWarningSoft: '#F5C46E',
  error: '#FF7A7A',
  errorSoft: '#3E1C1C',
  onErrorSoft: '#FF9B9B',
  info: '#6FA6E8',
  infoSoft: '#16293F',
  onInfoSoft: '#8DB8EE',
  errorText: '#FF9B9B',
  overlay: 'rgba(0, 0, 0, 0.62)',
  onMedia: '#FFFFFF',
  onMediaMuted: 'rgba(255, 255, 255, 0.3)',
  mediaBackground: '#000000',
  mediaScrim: 'rgba(0, 0, 0, 0.5)',
  focusRing: '#4DB6B6',
  // A raised layer, lighter than the page: the floating bar must stand out from it in the dark.
  tabBar: '#223333',
  tabBarInactive: '#9DB2B0',
  shadow: '#000000',
  heroStart: '#1D5757',
  heroEnd: '#0B2A2A',
  onHero: '#F1F6F4',
  onHeroMuted: '#CFE6E4',
  heroTrack: 'rgba(255, 255, 255, 0.16)',
  heroAccent: '#F0B877',
  heroGlass: 'rgba(255, 255, 255, 0.12)',
  photoScrim: '#000000',
};

/** 4 px grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const size = {
  /** Minimum touch target. */
  touch: 44,
  control: 48,
  icon: { sm: 16, md: 20, lg: 24, xl: 32 },
  avatar: { sm: 32, md: 40, lg: 56, xl: 96 },
  /** Mascot in empty and error states. */
  mascot: 150,
  /** How deep the wave at the bottom of a hero header goes. */
  curve: 28,
  tabBar: 68,
  shortcut: 104,
  animalLarge: { width: 264, height: 336 },
  animalCompact: { width: 168, height: 208 },
  orgCard: { width: 248 },
  galleryMax: 460,
  /** How much the white sheet of the detail screen climbs over the photo. */
  sheetOverlap: 32,
} as const;

export const motion = {
  fast: 150,
  base: 250,
  slow: 350,
} as const;

/**
 * Font families, one per weight: custom fonts on Android only work this way, so a text never
 * sets `fontWeight`. Baloo 2 is for titles and big numbers, Nunito for everything else.
 * The font files are loaded in `app/_layout.tsx` (see `theme/fonts.ts`).
 */
export const fontFamily = {
  body: 'Nunito_400Regular',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
  titleSoft: 'Baloo2_600SemiBold',
  title: 'Baloo2_700Bold',
  display: 'Baloo2_800ExtraBold',
} as const;

export interface TextStyleToken {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
}

// Baloo 2 has tall ascenders, so its line heights are looser than Nunito's to avoid clipping.
export const typography = {
  /** Big numbers: XP, level, counters. */
  stat: { fontFamily: fontFamily.display, fontSize: 44, lineHeight: 52 },
  display: { fontFamily: fontFamily.display, fontSize: 36, lineHeight: 44 },
  h1: { fontFamily: fontFamily.title, fontSize: 30, lineHeight: 38 },
  h2: { fontFamily: fontFamily.title, fontSize: 24, lineHeight: 32 },
  h3: { fontFamily: fontFamily.titleSoft, fontSize: 19, lineHeight: 26 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.bodyBold, fontSize: 16, lineHeight: 24 },
  bodySmall: { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20 },
  bodySmallStrong: { fontFamily: fontFamily.bodyBold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.bodyBold, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fontFamily.bodyHeavy, fontSize: 16, lineHeight: 20 },
} as const satisfies Record<string, TextStyleToken>;

export type TypographyVariant = keyof typeof typography;

export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export function makeShadows(color: string): Record<'sm' | 'md' | 'lg', Shadow> {
  return {
    // Soft and wide: cards float over the cream background instead of having borders.
    sm: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 10,
      elevation: 2,
    },
    md: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.11,
      shadowRadius: 20,
      elevation: 6,
    },
    lg: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.18,
      shadowRadius: 32,
      elevation: 14,
    },
  };
}

export const contentMaxWidth = 560;

export const screenColumn = {
  width: '100%' as const,
  maxWidth: contentMaxWidth,
  alignSelf: 'center' as const,
};
