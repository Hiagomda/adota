import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useNavigationContainerRef } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastProvider } from '../src/components/ui';
import { CrashScreen } from '../src/crash/CrashScreen';
import { ErrorBoundary } from '../src/crash/ErrorBoundary';
import { clearFatalError, setFatalError, useFatalError } from '../src/crash/fatalStore';
import { installGlobalErrorHandlers } from '../src/crash/globalHandlers';
import {
  navigationIntegration,
  reportError,
  startCrashReporter,
  wrapRoot,
} from '../src/crash/reporter';
import CupuOnboarding from '../src/cupu/CupuOnboarding';
import { DeviceFrame } from '../src/deviceFrame';
import { flushOutbox } from '../src/place/outbox';
import { queryClient } from '../src/queryClient';
import { useSession } from '../src/session';
import { appFonts } from '../src/theme';
import { UpdatePrompt } from '../src/updates/UpdatePrompt';

// Order matters: the reporter first, so the global handlers below can send what they catch.
startCrashReporter();
installGlobalErrorHandlers(setFatalError);

// The splash stays up until fonts and the saved session are ready, so nothing jumps or flashes.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// If a storage or font call hangs, the app still opens: better a system font than a frozen splash.
const STARTUP_TIMEOUT_MS = 6000;

const OUTBOX_INTERVAL_MS = 20_000;

function RootLayout() {
  const colorScheme = useColorScheme();
  const navigationRef = useNavigationContainerRef();
  const hydrate = useSession((state) => state.hydrate);
  const refresh = useSession((state) => state.refresh);
  const sessionReady = useSession((state) => state.ready);
  const fatal = useFatalError();
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [timedOut, setTimedOut] = useState(false);
  // Changing the key remounts the whole tree after a fatal error, a reload without leaving the app.
  const [generation, setGeneration] = useState(0);
  // A font that fails to load must not lock the app: text falls back to the system font.
  const fontsSettled = fontsLoaded || fontError !== null;
  const started = (fontsSettled && sessionReady) || timedOut;

  useEffect(() => {
    if (fontError) reportError(fontError, { source: 'handled', where: 'startup:fonts' });
  }, [fontError]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    navigationIntegration.registerNavigationContainer(navigationRef);
  }, [navigationRef]);

  useEffect(() => {
    if (started) return;
    const timer = setTimeout(() => {
      reportError(new Error('Startup took too long'), {
        source: 'handled',
        where: 'startup:timeout',
        extra: { fontsSettled, sessionReady },
      });
      setTimedOut(true);
    }, STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fontsSettled, sessionReady, started]);

  useEffect(() => {
    if (started) void SplashScreen.hideAsync().catch(() => undefined);
  }, [started]);

  useEffect(() => {
    // Storage itself failing is the only way this rejects; record it instead of a silent
    // unhandled rejection every 20 seconds.
    const flush = () =>
      flushOutbox().catch((error: unknown) =>
        reportError(error, { source: 'handled', where: 'outbox:flush' }),
      );
    void flush();
    const timer = setInterval(() => void flush(), OUTBOX_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!started) return null;

  if (fatal) {
    return (
      <CrashScreen
        error={fatal.error}
        eventId={fatal.eventId}
        retryLabel="Recarregar o app"
        onRetry={() => {
          clearFatalError();
          setGeneration((value) => value + 1);
        }}
      />
    );
  }

  return (
    <ErrorBoundary name="root" retryLabel="Recarregar o app" key={generation}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <DeviceFrame>
            <ToastProvider>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false }} />
              <CupuOnboarding />
              <UpdatePrompt />
            </ToastProvider>
          </DeviceFrame>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default wrapRoot(RootLayout);
