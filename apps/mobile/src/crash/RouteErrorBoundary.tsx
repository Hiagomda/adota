import { usePathname, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { CrashScreen } from './CrashScreen';
import { errorCode } from './errorInfo';
import { reportError } from './reporter';

function RouteCrash({ error, retry }: ErrorBoundaryProps) {
  const pathname = usePathname();
  // Reported once, when the screen for this error mounts. A different error remounts it (see key).
  const [eventId] = useState(() =>
    reportError(error, { source: 'route', where: pathname, fatal: true }),
  );
  return <CrashScreen error={error} eventId={eventId} onRetry={() => void retry()} />;
}

/**
 * Error screen of a single route. Expo Router mounts it when the route throws, so one broken
 * screen does not take the tabs and the rest of the app down with it.
 *
 * Use it from a route file: `export { RouteErrorBoundary as ErrorBoundary } from '.../crash/RouteErrorBoundary';`
 */
export function RouteErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteCrash key={errorCode(props.error)} {...props} />;
}
