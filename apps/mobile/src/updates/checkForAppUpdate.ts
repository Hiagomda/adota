import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { fetchWithTimeout, isNetworkError } from '../api';
import { appVersion, buildNumber } from '../appVersion';
import { reportError } from '../crash/reporter';
import { isNewerNativeRelease, parsePublishedNativeApp } from './publishedVersion';

const fallbackDownloadPage = 'http://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io';

function readDownloadPageUrl(extra: unknown): string | null {
  if (!extra || typeof extra !== 'object') return null;
  const value = (extra as Record<string, unknown>).downloadPageUrl;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const downloadPageUrl =
  process.env.EXPO_PUBLIC_DOWNLOAD_URL ??
  readDownloadPageUrl(Constants.expoConfig?.extra) ??
  fallbackDownloadPage;

export type AppUpdateOffer = { kind: 'native'; apkUrl: string } | { kind: 'ota' };

export function apkDownloadUrl(page: string): string {
  return `${page.replace(/\/$/, '')}/egua-adota.apk`;
}

async function checkNativeRelease(): Promise<AppUpdateOffer | null> {
  const page = downloadPageUrl.replace(/\/$/, '');
  const response = await fetchWithTimeout(`${page}/version.json`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) return null;
  const published = parsePublishedNativeApp(await response.json());
  if (!published) return null;
  const newer = isNewerNativeRelease(
    { version: appVersion.version, androidVersionCode: buildNumber() },
    published,
  );
  if (!newer) return null;
  return { kind: 'native', apkUrl: apkDownloadUrl(page) };
}

function otaUpdatesAvailable(): boolean {
  return requireOptionalNativeModule('ExpoUpdates') != null;
}

async function checkOtaUpdate(): Promise<AppUpdateOffer | null> {
  if (!otaUpdatesAvailable()) return null;
  const updates = await import('expo-updates');
  if (!updates.isEnabled) return null;
  const result = await updates.checkForUpdateAsync();
  if (result.isAvailable || result.isRollBackToEmbedded) return { kind: 'ota' };
  return null;
}

export async function checkForAppUpdate(): Promise<AppUpdateOffer | null> {
  if (Platform.OS === 'web') return null;

  if (Platform.OS === 'android') {
    try {
      const native = await checkNativeRelease();
      if (native) return native;
    } catch (error) {
      // Offline or timeout: the OTA check below may still succeed.
      if (!isNetworkError(error)) {
        reportError(error, { source: 'handled', where: 'update:native' });
      }
    }
  }

  try {
    return await checkOtaUpdate();
  } catch (error) {
    if (!isNetworkError(error)) {
      reportError(error, { source: 'handled', where: 'update:ota' });
    }
    return null;
  }
}

export async function applyOtaUpdate(): Promise<void> {
  if (!otaUpdatesAvailable()) {
    throw new Error('Update was not downloaded');
  }
  const updates = await import('expo-updates');
  const fetched = await updates.fetchUpdateAsync();
  if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
    throw new Error('Update was not downloaded');
  }
  await updates.reloadAsync();
}
