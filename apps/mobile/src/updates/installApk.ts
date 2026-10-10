import { Directory, File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { downloadPageUrl } from './checkForAppUpdate';

/** Android Intent flags. Grant the installer permission to read the APK we just saved. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export interface DownloadProgress {
  /** 0 to 1, or null when the server did not say how big the file is. */
  ratio: number | null;
}

/**
 * The download URL has to be the APK on our own page. A response that points somewhere else
 * must not be handed to the installer.
 */
export function assertOwnApkUrl(apkUrl: string, page = downloadPageUrl): void {
  const allowed = new URL(page);
  const target = new URL(apkUrl);
  if (target.protocol !== 'https:' || target.host !== allowed.host) {
    throw new Error('Endereço do aplicativo recusado.');
  }
  if (!target.pathname.endsWith('/egua-adota.apk')) {
    throw new Error('Arquivo do aplicativo recusado.');
  }
}

/** Downloads the APK into the app cache and opens the Android installer. Does not open the browser. */
export async function installApk(
  apkUrl: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  assertOwnApkUrl(apkUrl);
  const directory = new Directory(Paths.cache, 'updates');
  if (!directory.exists) directory.create();
  const target = new File(directory, 'egua-adota.apk');
  const file = await File.downloadFileAsync(apkUrl, target, {
    idempotent: true,
    onProgress: (data) => {
      if (!onProgress) return;
      onProgress({
        ratio: data.totalBytes > 0 ? data.bytesWritten / data.totalBytes : null,
      });
    },
  });
  await startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: FLAG_GRANT_READ_URI_PERMISSION,
  });
}

/** Opens the system page where this app is allowed to install updates. */
export function openInstallPermission(): Promise<unknown> {
  return startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
    data: 'package:app.egua.adota',
  });
}
