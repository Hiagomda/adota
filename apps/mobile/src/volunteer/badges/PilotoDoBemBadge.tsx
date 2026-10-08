import type { ImageSourcePropType } from 'react-native';
import SealImage, { type BadgeProps } from './SealImage';

const source = require('../../../assets/badges/piloto-do-bem.jpg') as ImageSourcePropType;

export default function PilotoDoBemBadge(props: BadgeProps) {
  return <SealImage {...props} source={source} />;
}
