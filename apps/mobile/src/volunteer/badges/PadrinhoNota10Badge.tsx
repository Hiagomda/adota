import type { ImageSourcePropType } from 'react-native';
import SealImage, { type BadgeProps } from './SealImage';

const source = require('../../../assets/badges/padrinho-nota-10.jpg') as ImageSourcePropType;

export default function PadrinhoNota10Badge(props: BadgeProps) {
  return <SealImage {...props} source={source} />;
}
