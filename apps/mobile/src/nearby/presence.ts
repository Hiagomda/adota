import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
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

/** Canal dos avisos no Android. O servidor manda o push para este id (apps/api/src/notify.ts). */
export const PUSH_CHANNEL_ID = 'avisos';

/**
 * Sem isto, um aviso que chega com o app aberto não aparece (o padrão do Expo é esconder), e no
 * Android 8+ ele cai no canal genérico do Firebase, sem destaque nem som de urgência.
 */
export function configurePushDisplay(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS !== 'android') return;
  Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Resgates e avisos',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  }).catch((error: unknown) => {
    reportError(error, { source: 'handled', where: 'push:channel' });
  });
}

/**
 * Ao sair da conta, este aparelho deixa de receber os avisos dela. Sem isso os resgates e as
 * conversas da conta antiga seguiam chegando até outra pessoa entrar no celular.
 */
export async function releasePushToken(token: string): Promise<void> {
  try {
    const notifications = await Notifications.getPermissionsAsync();
    if (notifications.status !== 'granted') return;
    const push = await Notifications.getDevicePushTokenAsync();
    const value = typeof push.data === 'string' ? push.data : null;
    // Curto: sem internet, sair da conta não pode ficar esperando.
    if (value) {
      await api('/me/fcm-token', {
        method: 'DELETE',
        token,
        body: { token: value },
        timeoutMs: 4000,
      });
    }
  } catch (error) {
    reportError(error, { source: 'handled', where: 'presence:push-release' });
  }
}

/**
 * O Firebase pode trocar o token do aparelho com o app aberto (reinstalação de serviços, limpeza
 * de dados). O novo vai para a conta na hora, sem esperar o app voltar do segundo plano.
 */
export function watchPushToken(currentToken: () => string | null): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const subscription = Notifications.addPushTokenListener((push) => {
    const value = typeof push.data === 'string' ? push.data : null;
    const token = currentToken();
    if (!value || !token) return;
    api('/me/fcm-token', { method: 'POST', token, body: { token: value } }).catch(
      (error: unknown) => {
        reportError(error, { source: 'handled', where: 'presence:push-refresh' });
      },
    );
  });
  return () => subscription.remove();
}
