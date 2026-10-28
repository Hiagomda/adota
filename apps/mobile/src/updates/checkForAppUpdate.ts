import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { fetchWithTimeout, isNetworkError } from '../api';
import { appVersion, buildNumber } from '../appVersion';
import { reportError } from '../crash/reporter';
import { withDeadline } from './deadline';
import { isNewerNativeRelease, parsePublishedNativeApp } from './publishedVersion';

const fallbackDownloadPage = 'http://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io';

/** The VPS answers in well under a second. Past this, the app opens and skips the offer. */
export const UPDATE_CHECK_TIMEOUT_MS = 3000;

function readDownloadPageUrl(extra: unknown): string | null {
  if (!extra || typeof extra !== 'object') return null;
  const value = (extra as Record<string, unknown>).downloadPageUrl;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const downloadPageUrl =
  process.env.EXPO_PUBLIC_DOWNLOAD_URL ??
  readDownloadPageUrl(Constants.expoConfig?.extra) ??
  fallbackDownloadPage;

/** A newer APK on the download page of the VPS. That page is the only update source. */
export type AppUpdateOffer = {
  apkUrl: string;
  version: string;
  notes: string[];
  /** Precisa desinstalar antes: a atualização por cima falharia com "app não instalado". */
  reinstall: boolean;
};

export function apkDownloadUrl(page: string): string {
  return `${page.replace(/\/$/, '')}/egua-adota.apk`;
}

async function checkNativeRelease(): Promise<AppUpdateOffer | null> {
  const page = downloadPageUrl.replace(/\/$/, '');
  const response = await fetchWithTimeout(
    `${page}/version.json`,
    { headers: { accept: 'application/json', 'cache-control': 'no-cache' } },
    UPDATE_CHECK_TIMEOUT_MS,
  );
  if (!response.ok) return null;
  const published = parsePublishedNativeApp(await response.json());
  if (!published) return null;
  const newer = isNewerNativeRelease(
    { version: appVersion.version, androidVersionCode: buildNumber() },
    published,
  );
  if (!newer) return null;
  return {
    apkUrl: apkDownloadUrl(page),
    version: published.version,
    notes: published.notes,
    reinstall: published.reinstall,
  };
}

/** Never rejects and never takes longer than the timeout: a dead VPS only means no offer. */
export async function checkForAppUpdate(): Promise<AppUpdateOffer | null> {
  // The APK from the VPS is the Android channel. iOS will update through the App Store.
  if (Platform.OS !== 'android') return null;
  try {
    return await withDeadline(checkNativeRelease(), UPDATE_CHECK_TIMEOUT_MS, null);
  } catch (error) {
    if (!isNetworkError(error)) {
      reportError(error, { source: 'handled', where: 'update:native' });
    }
    return null;
  }
}

let startupCheck: Promise<AppUpdateOffer | null> | null = null;

/**
 * The first thing the app does when the JS starts. Later callers get the same answer instead of
 * asking the VPS again.
 */
export function startStartupUpdateCheck(): Promise<AppUpdateOffer | null> {
  startupCheck ??= checkForAppUpdate();
  return startupCheck;
}
