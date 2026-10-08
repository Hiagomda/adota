import type { ImageSourcePropType } from 'react-native';
import SealImage, { type BadgeProps } from './SealImage';

const source = require('../../../assets/badges/heroi-local.jpg') as ImageSourcePropType;

export default function HeroiLocalBadge(props: BadgeProps) {
  return <SealImage {...props} source={source} />;
}
