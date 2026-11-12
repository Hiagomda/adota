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

/**
 * O limite da área atendida: um véu leve fora dela e uma linha fina por cima. A linha sai do
 * contorno simplificado (`serviceShape`), então não dobra nas margens dos rios.
 */
export const serviceLimit = {
  lineWidth: 2,
  lineOpacity: 0.85,
  maskOpacity: 0.22,
} as const;
