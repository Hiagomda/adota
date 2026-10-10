import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type AppEnvironment = 'development' | 'preview' | 'production';

export interface AppVersion {
  /** Semantic version, e.g. "1.0.0". */
  version: string;
  /** Android versionCode / iOS build number as a string, or "0" when unknown. */
  build: string;
  environment: AppEnvironment;
  /** Bundle identifier / Android package. */
  applicationId: string | null;
  /** Short git commit recorded by app.config.ts when the build was made. */
  commit: string | null;
  /** ISO timestamp recorded by app.config.ts when the build was made. */
  builtAt: string | null;
}

function readEnvironment(): AppEnvironment {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  if (raw === 'development' || raw === 'preview' || raw === 'production') return raw;
  return __DEV__ ? 'development' : 'production';
}

function readBuildInfo(extra: unknown): { commit: string | null; builtAt: string | null } {
  if (!extra || typeof extra !== 'object') return { commit: null, builtAt: null };
  const build = (extra as { build?: unknown }).build;
  if (!build || typeof build !== 'object') return { commit: null, builtAt: null };
  const { commit, builtAt } = build as { commit?: unknown; builtAt?: unknown };
  return {
    commit: typeof commit === 'string' && commit.length > 0 ? commit : null,
    builtAt: typeof builtAt === 'string' && builtAt.length > 0 ? builtAt : null,
  };
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
  ...readBuildInfo(Constants.expoConfig?.extra),
};

/** Integer build number, or null when the native build did not expose one (web, tests). */
export function buildNumber(value: AppVersion = appVersion): number | null {
  const parsed = Number.parseInt(value.build, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "1.0.0 (build 3)" */
export function formatAppVersion(value: AppVersion = appVersion): string {
  return `${value.version} (build ${value.build})`;
}

/** Release name shared with the crash reporter, e.g. "app.egua.adota@1.0.0+3". */
export function releaseName(value: AppVersion = appVersion): string {
  const id = value.applicationId ?? 'app.egua.adota';
  return `${id}@${value.version}+${value.build}`;
}

/** Headers that identify the installed app to the API. */
export function appVersionHeaders(value: AppVersion = appVersion): Record<string, string> {
  return {
    'x-app-version': value.version,
    'x-app-build': value.build,
    'x-app-platform': Platform.OS,
  };
}
