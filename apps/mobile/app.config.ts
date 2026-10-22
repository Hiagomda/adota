import type { ConfigContext, ExpoConfig } from 'expo/config';
import type { ConfigPlugin } from 'expo/config-plugins';
// A config carrega como ESM: a entrada CommonJS precisa da extensão e de import default.
import configPlugins from 'expo/config-plugins.js';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addReleaseSigning } from './plugins/releaseSigning.mjs';

const appDir = path.dirname(fileURLToPath(import.meta.url));
const googleServicesAndroid = path.join(appDir, 'google-services.json');
const googleServicesIos = path.join(appDir, 'GoogleService-Info.plist');

// Única fonte da versão. `pnpm version:bump` sobe o `build` antes de cada APK.
const release = JSON.parse(readFileSync(path.join(appDir, 'version.json'), 'utf8')) as {
  version: string;
  build: number;
};

// O bundle de release grava estes valores. O build 22 saiu sem o client id do Google e ninguém
// conseguia entrar; por isso um bundle de produção sem algum deles para a compilação aqui.
const requiredForRelease = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_DOWNLOAD_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  // Sem ele nenhum erro dos celulares chega à equipe.
  'EXPO_PUBLIC_SENTRY_DSN',
];
if (process.env.NODE_ENV === 'production') {
  const missing = requiredForRelease.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Release build without ${missing.join(', ')}. Fill apps/mobile/.env first.`);
  }
}

// Gravado quando a config é avaliada, o que acontece em todo build nativo (o expo-constants
// regera o app.config no preBuild do Gradle) e em todo `expo export`.
function gitCommit(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_GIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // Fora de um checkout git (tarball de CI, contexto Docker): o painel mostra "desconhecido".
    return null;
  }
}
const buildInfo = { commit: gitCommit(), builtAt: new Date().toISOString() };
// API, MinIO e imgproxy estão em HTTP até existir um domínio com TLS. O Expo ignora o campo
// `android.usesCleartextTraffic`, então o manifest recebe a permissão aqui. O build 23 perdeu isso
// no prebuild e todas as chamadas à API falharam.
const withCleartextTraffic: ConfigPlugin = (expo) =>
  configPlugins.withAndroidManifest(expo, (mod) => {
    const application = configPlugins.AndroidConfig.Manifest.getMainApplicationOrThrow(
      mod.modResults,
    );
    application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
// O APK de release usa a chave privada de upload quando o Gradle a encontra (plugins/releaseSigning.mjs).
const withReleaseSigning: ConfigPlugin = (expo) =>
  configPlugins.withAppBuildGradle(expo, (mod) => {
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents);
    return mod;
  });
// Relatos de erro. O DSN é público e fica em EXPO_PUBLIC_SENTRY_DSN; o token de envio dos source
// maps é SENTRY_AUTH_TOKEN na compilação e nunca vai para dentro do app.
const sentryPlugin = {
  url: 'https://sentry.io/',
  ...(process.env.SENTRY_ORG ? { organization: process.env.SENTRY_ORG } : {}),
  ...(process.env.SENTRY_PROJECT ? { project: process.env.SENTRY_PROJECT } : {}),
};

export default ({ config }: ConfigContext): ExpoConfig =>
  withReleaseSigning(
    withCleartextTraffic({
      ...config,
      name: 'Égua, adota!',
      slug: 'egua',
      scheme: 'egua',
      version: release.version,
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
        ...(existsSync(googleServicesIos)
          ? { googleServicesFile: './GoogleService-Info.plist' }
          : {}),
      },
      android: {
        package: 'app.egua.adota',
        versionCode: release.build,
        adaptiveIcon: {
          foregroundImage: './assets/adaptive-icon.png',
          backgroundColor: '#F3E8D2',
          monochromeImage: './assets/adaptive-icon-mono.png',
        },
        predictiveBackGestureEnabled: false,
        permissions: ['REQUEST_INSTALL_PACKAGES'],
        ...(existsSync(googleServicesAndroid)
          ? { googleServicesFile: './google-services.json' }
          : {}),
      },
      web: {
        bundler: 'metro',
        favicon: './assets/favicon.png',
      },
      extra: {
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010',
        downloadPageUrl:
          process.env.EXPO_PUBLIC_DOWNLOAD_URL ??
          'https://adota.warlord-core.site',
        build: buildInfo,
        eas: {
          projectId: 'b5a8c1e6-e9bd-45f0-9f94-9042c41f4732',
        },
      },
      plugins: [
        'expo-router',
        'expo-dev-client',
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
        // O app web do iPhone mora em <download>/app. Só o `expo export --platform web` do
        // workflow define isto; o celular e o `expo start` continuam na raiz.
        ...(process.env.EXPO_WEB_BASE_URL ? { baseUrl: process.env.EXPO_WEB_BASE_URL } : {}),
      },
    }),
  );
