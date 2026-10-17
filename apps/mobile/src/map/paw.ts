import { Image, type ImageSourcePropType } from 'react-native';

export type Urgency = 'low' | 'medium' | 'high';

/**
 * Marcador do mapa (gota com patinha), já pintado: verde baixa, caramelo média, vermelha alta.
 * Gerado por scripts/paw-pins.mjs.
 */
export const pawSource: Record<Urgency, ImageSourcePropType> = {
  high: require('../../assets/paw-high.png'),
  medium: require('../../assets/paw-medium.png'),
  low: require('../../assets/paw-low.png'),
};

export function pawUri(urgency: Urgency): string {
  const source = pawSource[urgency];
  // No web o módulo de imagem já é `{ uri }` e o react-native-web não tem o
  // resolveAssetSource: chamá-lo dava erro no moveend do mapa e nenhuma pata aparecia.
  if (!Array.isArray(source) && typeof source === 'object' && typeof source.uri === 'string') {
    return source.uri;
  }
  return Image.resolveAssetSource(source)?.uri ?? '';
}
