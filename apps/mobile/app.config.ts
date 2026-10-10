import type { ConfigContext, ExpoConfig } from 'expo/config';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const googleServicesAndroid = path.join(appDir, 'google-services.json');
const googleServicesIos = path.join(appDir, 'GoogleService-Info.plist');

// Single source of truth for the version. `pnpm version:bump` raises `build` before every APK.
const release = JSON.parse(readFileSync(path.join(appDir, 'version.json'), 'utf8')) as {
  version: string;
  build: number;
};

// Recorded when the config is evaluated, which happens on every native build (expo-constants
// regenerates app.config at Gradle preBuild) and on every `expo export`.
function gitCommit(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_GIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { cwd: appDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // Not a git checkout (CI tarball, Docker context): the panel shows "desconhecido".
    return null;
  }
}
const buildInfo = { commit: gitCommit(), builtAt: new Date().toISOString() };
// Expo's Android config type omits this field. The test API is plain HTTP.
const androidCleartext = { usesCleartextTraffic: true };
// Crash reports. The DSN is public and lives in EXPO_PUBLIC_SENTRY_DSN; the upload token for
// source maps is SENTRY_AUTH_TOKEN at build time and is never written into the app.
const sentryPlugin = {
  url: 'https://sentry.io/',
  ...(process.env.SENTRY_ORG ? { organization: process.env.SENTRY_ORG } : {}),
  ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Égua, adota!',
  slug: 'egua',
  scheme: 'egua',
  version: release.version,
  runtimeVersion: {
    policy: 'appVersion',
  },
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.egua.adota',
    buildNumber: String(release.build),
    supportsTablet: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Égua, adota! usa sua localização para indicar onde o animal está e para mostrar resgates perto de você.',
      NSCameraUsageDescription:
        'Égua, adota! usa a câmera para você fotografar o animal que precisa de resgate.',
      NSPhotoLibraryUsageDescription:
        'Égua, adota! acessa suas fotos para você anexar imagens do animal ao resgate.',
    },
    ...(existsSync(googleServicesIos) ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
  },
  android: {
    package: 'app.egua.adota',
    versionCode: release.build,
    ...androidCleartext,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F3E8D2',
      monochromeImage: './assets/adaptive-icon-mono.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['REQUEST_INSTALL_PACKAGES'],
    ...(existsSync(googleServicesAndroid) ? { googleServicesFile: './google-services.json' } : {}),
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
  },
  updates: {
    url: 'https://u.expo.dev/b5a8c1e6-e9bd-45f0-9f94-9042c41f4732',
    checkAutomatically: 'NEVER',
    fallbackToCacheTimeout: 0,
    requestHeaders: {
      'expo-channel-name': 'preview',
    },
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010',
    downloadPageUrl:
      process.env.EXPO_PUBLIC_DOWNLOAD_URL ??
      'http://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io',
    build: buildInfo,
    eas: {
      projectId: 'b5a8c1e6-e9bd-45f0-9f94-9042c41f4732',
    },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-updates',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Égua, adota! usa sua localização para indicar onde o animal está e para mostrar resgates perto de você.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Égua, adota! usa a câmera para você fotografar o animal que precisa de resgate.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Égua, adota! acessa suas fotos para você anexar imagens do animal ao resgate.',
        cameraPermission:
          'Égua, adota! usa a câmera para você fotografar o animal que precisa de resgate.',
      },
    ],
    'expo-notifications',
    'expo-apple-authentication',
    ['@sentry/react-native/expo', sentryPlugin],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F3E8D2',
        image: './assets/splash-icon.png',
        imageWidth: 200,
        dark: {
          backgroundColor: '#173B3F',
          image: './assets/splash-icon.png',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
