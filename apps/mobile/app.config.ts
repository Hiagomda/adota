import type { ConfigContext, ExpoConfig } from 'expo/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const googleServicesAndroid = path.join(appDir, 'google-services.json');
const googleServicesIos = path.join(appDir, 'GoogleService-Info.plist');

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Égua, adota!',
  slug: 'egua',
  scheme: 'egua',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.egua.adota',
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Égua, adota! usa sua localização para mostrar animais que precisam de resgate perto de você e para marcar onde você encontrou um animal.',
      NSCameraUsageDescription:
        'Égua, adota! usa a câmera para você fotografar o animal que precisa de resgate.',
      NSPhotoLibraryUsageDescription:
        'Égua, adota! acessa suas fotos para você anexar imagens do animal ao alerta de resgate.',
    },
    ...(existsSync(googleServicesIos) ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
  },
  android: {
    package: 'app.egua.adota',
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
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010',
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Égua, adota! usa sua localização para mostrar animais que precisam de resgate perto de você e para marcar onde você encontrou um animal.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Égua, adota! acessa suas fotos para você anexar imagens do animal ao alerta de resgate.',
        cameraPermission:
          'Égua, adota! usa a câmera para você fotografar o animal que precisa de resgate.',
      },
    ],
    'expo-notifications',
    'expo-apple-authentication',
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
