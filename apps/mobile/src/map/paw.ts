import { Image, type ImageSourcePropType } from 'react-native';

export type Urgency = 'low' | 'medium' | 'high';

/** A arte da patinha, já pintada: verde baixa, laranja média, vermelha alta. */
export const pawSource: Record<Urgency, ImageSourcePropType> = {
  high: require('../../assets/paw-high.png'),
  medium: require('../../assets/paw-medium.png'),
  low: require('../../assets/paw-low.png'),
};

export function pawUri(urgency: Urgency): string {
  return Image.resolveAssetSource(pawSource[urgency])?.uri ?? '';
}
