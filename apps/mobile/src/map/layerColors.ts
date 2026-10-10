import { lightColors } from '../theme';

/**
 * Colors of the map layers. The native renderer draws them outside React,
 * so they come from the light tokens and do not follow the dark theme.
 */
export const mapColors = {
  outsideArea: '#1B2B2B',
  areaOutline: lightColors.success,
  accuracy: lightColors.secondary,
} as const;
