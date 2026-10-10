import * as Application from 'expo-application';
import Constants from 'expo-constants';

export type AppEnvironment = 'development' | 'preview' | 'production';

export interface AppVersion {
  /** Semantic version, e.g. "1.0.0". */
  version: string;
  /** Android versionCode / iOS build number as a string, or "0" when unknown. */
  build: string;
  environment: AppEnvironment;
  /** Bundle identifier / Android package. */
  applicationId: string | null;
}

function readEnvironment(): AppEnvironment {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  if (raw === 'development' || raw === 'preview' || raw === 'production') return raw;
  return __DEV__ ? 'development' : 'production';
}

/** Single source of truth for the installed version. Read from the native build, never typed by hand. */
export const appVersion: AppVersion = {
  version:
    Application.nativeApplicationVersion ??
    Constants.nativeAppVersion ??
    Constants.expoConfig?.version ??
    '0.0.0',
  build: Application.nativeBuildVersion ?? Constants.nativeBuildVersion ?? '0',
  environment: readEnvironment(),
  applicationId: Application.applicationId,
};

/** "1.0.0 (build 3)" */
export function formatAppVersion(value: AppVersion = appVersion): string {
  return `${value.version} (build ${value.build})`;
}

/** Release name shared with the crash reporter, e.g. "app.egua.adota@1.0.0+3". */
export function releaseName(value: AppVersion = appVersion): string {
  const id = value.applicationId ?? 'app.egua.adota';
  return `${id}@${value.version}+${value.build}`;
}
