import type { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const googleServicesAndroid = path.join(appDir, 'google-services.json');
const googleServicesIos = path.join(appDir, 'GoogleService-Info.plist');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Patinha',
  slug: 'patinha',
  scheme: 'patinha',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.patinha.mobile',
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'O Patinha usa sua localização para mostrar animais que precisam de resgate perto de você e para marcar onde você encontrou um animal.',
      NSCameraUsageDescription:
        'O Patinha usa a câmera para você fotografar o animal que precisa de resgate.',
      NSPhotoLibraryUsageDescription:
        'O Patinha acessa suas fotos para você anexar imagens do animal ao alerta de resgate.',
    },
    ...(existsSync(googleServicesIos) ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
  },
  android: {
    package: 'app.patinha.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FF6B3D',
      monochromeImage: './assets/adaptive-icon.png',
    },
    predictiveBackGestureEnabled: false,
    ...(existsSync(googleServicesAndroid) ? { googleServicesFile: './google-services.json' } : {}),
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FF6B3D',
        image: './assets/splash-icon.png',
        imageWidth: 200,
        dark: {
          backgroundColor: '#121212',
          image: './assets/splash-icon.png',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
