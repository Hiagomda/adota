import { lightColors } from '../theme';

/**
 * Cores das camadas do mapa. O renderizador nativo desenha fora do React,
 * então elas vêm dos tokens claros e não seguem o tema escuro.
 */
export const mapColors = {
  outsideArea: '#1B2B2B',
  areaOutline: lightColors.success,
  accuracy: lightColors.secondary,
  /** Área de toque invisível (opacidade quase zero) sobre os marcadores. */
  hitArea: lightColors.shadow,
} as const;
