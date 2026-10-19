import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform } from 'react-native';
import { logBestEffort } from '../crash/bestEffort';

const schemeKey = '@egua_adota:color_scheme';

/** The app-only override needs Android 10 (API 29); older phones keep the system theme. */
export const canChooseScheme =
  Platform.OS === 'android' ? Platform.Version >= 29 : Platform.OS === 'ios';

/** Applies the theme picked last time. Without a choice, the app follows the phone. */
export async function primeColorScheme(): Promise<void> {
  if (!canChooseScheme) return;
  const saved = await AsyncStorage.getItem(schemeKey);
  if (saved === 'light' || saved === 'dark') Appearance.setColorScheme(saved);
}

/** Flips between light and dark and remembers it for the next launch. */
export function toggleColorScheme(current: 'light' | 'dark'): void {
  const next = current === 'dark' ? 'light' : 'dark';
  Appearance.setColorScheme(next);
  void AsyncStorage.setItem(schemeKey, next).catch(logBestEffort('theme:save'));
}
