import type { ImageSourcePropType } from 'react-native';
import SealImage, { type BadgeProps } from './SealImage';

const source = require('../../../assets/badges/olheiro.jpg') as ImageSourcePropType;

export default function OlheiroVizinhancaBadge(props: BadgeProps) {
  return <SealImage {...props} source={source} />;
}
