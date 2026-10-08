import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import CupuOnboarding from '../src/cupu/CupuOnboarding';
import { DeviceFrame } from '../src/deviceFrame';
import { flushOutbox } from '../src/place/outbox';
import { useSession } from '../src/session';
import { UpdatePrompt } from '../src/updates/UpdatePrompt';

const queryClient = new QueryClient();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const hydrate = useSession((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    void flushOutbox();
    const timer = setInterval(() => void flushOutbox(), 20_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <DeviceFrame>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }} />
          <CupuOnboarding />
          <UpdatePrompt />
        </DeviceFrame>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
