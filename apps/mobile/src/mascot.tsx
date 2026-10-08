import { Image } from 'react-native';

const poses = {
  sit: require('../assets/mascot/sit.png'),
  wave: require('../assets/mascot/wave.png'),
  sad: require('../assets/mascot/sad.png'),
  drive: require('../assets/mascot/drive.png'),
  search: require('../assets/mascot/search.png'),
  home: require('../assets/mascot/home.png'),
} as const;

export type MascotPose = keyof typeof poses;

export function Mascot({
  pose,
  size = 160,
  label,
}: {
  pose: MascotPose;
  size?: number;
  label?: string;
}) {
  return (
    <Image
      source={poses[pose]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={Boolean(label)}
      accessibilityLabel={label}
    />
  );
}
