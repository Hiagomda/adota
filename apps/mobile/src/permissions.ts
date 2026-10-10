import type { PermissionResponse } from 'expo-modules-core';
import { Linking, Platform } from 'react-native';

/**
 * - granted: go ahead.
 * - denied: the user said no this time; asking again later is allowed.
 * - blocked: the system will not show the dialog again ("don't ask again" on Android, any
 *   denial on iOS). The only way forward is the app's page in the device settings.
 */
export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

export function permissionOutcome(response: Pick<PermissionResponse, 'granted' | 'canAskAgain'>): PermissionOutcome {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'denied' : 'blocked';
}

/** Opens this app's page in the device settings, where a blocked permission can be turned on. */
export function openAppSettings(): Promise<void> {
  // On Android openSettings goes to the app details page; on iOS to the app's settings pane.
  return Linking.openSettings();
}

/** Label for the button shown next to a blocked permission. */
export const openSettingsLabel = Platform.OS === 'ios' ? 'Abrir Ajustes' : 'Abrir configurações';
