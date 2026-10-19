import { Image } from 'react-native';

const poses = {
  sit: require('../assets/mascot/sit.png'),
  wave: require('../assets/mascot/wave.png'),
  sad: require('../assets/mascot/sad.png'),
  drive: require('../assets/mascot/drive.png'),
  search: require('../assets/mascot/search.png'),
  home: require('../assets/mascot/home.png'),
  offline: require('../assets/mascot/offline.png'),
  chat: require('../assets/mascot/chat.png'),
  quiet: require('../assets/mascot/quiet.png'),
  party: require('../assets/mascot/party.png'),
  login: require('../assets/mascot/login.png'),
  map: require('../assets/mascot/map.png'),
  bowl: require('../assets/mascot/bowl.png'),
  camera: require('../assets/mascot/camera.png'),
  saved: require('../assets/mascot/saved.png'),
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
