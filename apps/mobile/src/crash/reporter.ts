import * as Sentry from '@sentry/react-native';
import { appVersion, releaseName } from '../appVersion';
import { describeError } from './errorInfo';

export const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? null;

/** Expo Router navigation breadcrumbs and screen-load spans. Registered by the root layout. */
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

let started = false;

/**
 * Starts the crash reporter once, before the first render.
 * Without a DSN nothing leaves the device: errors still go to the console with the same metadata,
 * so a build without Sentry configured behaves the same, only quieter.
 */
export function startCrashReporter(): void {
  if (started) return;
  started = true;
  Sentry.init({
    dsn: sentryDsn ?? undefined,
    enabled: sentryDsn !== null,
    release: releaseName(),
    dist: appVersion.build,
    environment: appVersion.environment,
    sendDefaultPii: false,
    enableAutoSessionTracking: true,
    tracesSampleRate: appVersion.environment === 'production' ? 0.2 : 1,
    integrations: [navigationIntegration],
  });
  Sentry.setTag('app.version', appVersion.version);
  Sentry.setTag('app.build', appVersion.build);
}

export type ErrorSource = 'boundary' | 'route' | 'global' | 'promise' | 'handled';

export interface ReportContext {
  source: ErrorSource;
  /** Where it happened: route name, screen or feature. */
  where?: string;
  fatal?: boolean;
  extra?: Record<string, unknown>;
}

/**
 * Records an error with the crash reporter and the console.
 * Returns the reporter event id (shown on the error screen) or null when reporting is off.
 */
export function reportError(error: unknown, context: ReportContext): string | null {
  const info = describeError(error);
  const label = `[${context.source}${context.where ? `:${context.where}` : ''}]`;
  if (context.fatal) console.error(label, info.name, info.message, info.stack ?? '');
  else console.warn(label, info.name, info.message);

  if (sentryDsn === null) return null;
  const exception = error instanceof Error ? error : new Error(info.message);
  return Sentry.captureException(exception, {
    level: context.fatal ? 'fatal' : 'error',
    tags: { source: context.source, where: context.where ?? 'unknown' },
    extra: context.extra,
  });
}

export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}

/** Attaches the signed-in person to future reports. Only the id and handle, never phone or e-mail. */
export function setReporterUser(user: { id: string; handle: string } | null): void {
  Sentry.setUser(user ? { id: user.id, username: user.handle } : null);
}

export const wrapRoot = Sentry.wrap;
