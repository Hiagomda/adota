import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { useTheme } from './theme';

/** White status bar icons while a screen with a dark header or photo on top is focused. */
export function useLightStatusBar(): void {
  const { dark } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(dark ? 'light' : 'dark');
    }, [dark]),
  );
}
