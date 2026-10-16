import { Image, type ImageSourcePropType } from 'react-native';

export type Urgency = 'low' | 'medium' | 'high';

/** A arte da patinha, já pintada: verde baixa, laranja média, vermelha alta. */
export const pawSource: Record<Urgency, ImageSourcePropType> = {
  high: require('../../assets/paw-high.png'),
  medium: require('../../assets/paw-medium.png'),
  low: require('../../assets/paw-low.png'),
};

export function pawUri(urgency: Urgency): string {
  const source = pawSource[urgency];
  // On the web an image module already is `{ uri }`, and react-native-web has no
  // resolveAssetSource: calling it threw inside the map's moveend and no paw was drawn.
  if (!Array.isArray(source) && typeof source === 'object' && typeof source.uri === 'string') {
    return source.uri;
  }
  return Image.resolveAssetSource(source)?.uri ?? '';
}
