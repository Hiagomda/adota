import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { api } from '../api';
import { reportError } from '../crash/reporter';

/**
 * Saves where this phone is, and the push token, so a new rescue can reach people nearby.
 * Only uses permissions the person already granted. It does not open a new system dialog.
 */
export async function syncNearbyPresence(token: string): Promise<void> {
  try {
    const location = await Location.getForegroundPermissionsAsync();
    if (location.status === 'granted') {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await api('/me', {
        method: 'PATCH',
        token,
        body: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      });
    }
  } catch (error) {
    reportError(error, { source: 'handled', where: 'presence:location' });
  }

  try {
    const notifications = await Notifications.getPermissionsAsync();
    if (notifications.status !== 'granted') return;
    const push = await Notifications.getDevicePushTokenAsync();
    const value = typeof push.data === 'string' ? push.data : null;
    if (value) await api('/me/fcm-token', { method: 'POST', token, body: { token: value } });
  } catch (error) {
    reportError(error, { source: 'handled', where: 'presence:push' });
  }
}
