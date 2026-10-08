import type { ImageSourcePropType } from 'react-native';
import SealImage, { type BadgeProps } from './SealImage';

const source = require('../../../assets/badges/portas-abertas.jpg') as ImageSourcePropType;

export default function PortasAbertasBadge(props: BadgeProps) {
  return <SealImage {...props} source={source} />;
}
