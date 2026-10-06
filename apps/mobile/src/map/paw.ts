import type { ImageSourcePropType } from 'react-native';

export type Urgency = 'low' | 'medium' | 'high';

/** A arte da patinha, já pintada: verde baixa, laranja média, vermelha alta. */
export const pawSource: Record<Urgency, ImageSourcePropType> = {
  high: require('../../assets/paw-high.png'),
  medium: require('../../assets/paw-medium.png'),
  low: require('../../assets/paw-low.png'),
};

export function pawUri(urgency: Urgency): string {
  const asset = pawSource[urgency];
  if (typeof asset === 'string') return asset;
  if (typeof asset === 'object' && asset !== null && 'uri' in asset && typeof asset.uri === 'string') {
    return asset.uri;
  }
  return '';
}
