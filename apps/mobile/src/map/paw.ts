import { Image, type ImageSourcePropType } from 'react-native';
import type { PartnerPinKind } from '../partners/partners';

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

/** Casinha dos Parceiros do Cupu (scripts/partner-pin.mjs). */
export const partnerPinSource: ImageSourcePropType = require('../../assets/partner-pin.png');

/** Casinha de cada tipo: cruz para veterinário e clínica, sacolinha para as lojas. */
export const partnerPinSources: Record<PartnerPinKind, ImageSourcePropType> = {
  generic: partnerPinSource,
  petshop: require('../../assets/partner-pin-petshop.png'),
  vet: require('../../assets/partner-pin-vet.png'),
};

export function pawUri(urgency: Urgency): string {
  return imageUri(pawSource[urgency]);
}

export function partnerPinUri(kind: PartnerPinKind = 'generic'): string {
  return imageUri(partnerPinSources[kind]);
}

function imageUri(source: ImageSourcePropType): string {
  // No web o módulo de imagem já é `{ uri }` e o react-native-web não tem o
  // resolveAssetSource: chamá-lo dava erro no moveend do mapa e nenhuma pata aparecia.
  if (!Array.isArray(source) && typeof source === 'object' && typeof source.uri === 'string') {
    return source.uri;
  }
  return Image.resolveAssetSource(source)?.uri ?? '';
}
