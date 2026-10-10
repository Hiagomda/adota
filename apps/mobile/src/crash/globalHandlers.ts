import { reportError } from './reporter';

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler: () => ErrorHandler;
  setGlobalHandler: (handler: ErrorHandler) => void;
}

interface PromiseRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
}

interface RuntimeGlobals {
  ErrorUtils?: ErrorUtilsLike;
  HermesInternal?: PromiseRejectionTracker | null;
}

const runtime = globalThis as unknown as RuntimeGlobals;

let installed = false;

/**
 * Catches what no component sees: errors thrown outside React (timers, event handlers,
 * native callbacks) and promises rejected with nobody listening.
 *
 * In a release build React Native's default handler kills the process on a fatal error.
 * Here the error is recorded and handed to the UI, which shows the error screen instead.
 * In development the previous handler still runs so the RedBox keeps working.
 */
export function installGlobalErrorHandlers(
  onFatal: (error: unknown, eventId: string | null) => void,
): void {
  if (installed) return;
  installed = true;

  const errorUtils = runtime.ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      const eventId = reportError(error, { source: 'global', fatal: isFatal === true });
      if (isFatal) onFatal(error, eventId);
      if (__DEV__) previous(error, isFatal);
    });
  }

  runtime.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (id, error) => {
      reportError(error, { source: 'promise', extra: { rejectionId: id } });
    },
    onHandled: () => undefined,
  });
}
