import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export function DeviceFrame({ children }: { children: ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
