import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useSession } from '../src/session';
import { palette, screenColumn, useTheme } from '../src/theme';

export default function PermissionsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const finishPermissions = useSession((state) => state.finishPermissions);
  const [message, setMessage] = useState(
    'A localização mostra alertas perto de você. As notificações avisam quando alguém precisa de ajuda.',
  );

  async function allow() {
    const location = await Location.requestForegroundPermissionsAsync();
    const notifications = await Notifications.requestPermissionsAsync();
    if (location.status !== 'granted') {
      setMessage(
        'Sem a localização, o feed usa o centro de Belém. Você pode permitir depois nas configurações do aparelho.',
      );
    }
    if (notifications.status === 'granted' && token) {
      try {
        const push = await Notifications.getDevicePushTokenAsync();
        const value = typeof push.data === 'string' ? push.data : null;
        if (value) await api('/me/fcm-token', { method: 'POST', token, body: { token: value } });
      } catch {
        setMessage('As notificações deste navegador ficam só dentro do app.');
      }
    }
    await finishPermissions();
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.column}>
      <Text style={[styles.title, { color: theme.text }]}>Perto de você</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{message}</Text>
      <Pressable style={styles.button} onPress={() => void allow()}>
        <Text style={styles.buttonText}>Entendi</Text>
      </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  column: { ...screenColumn, padding: 24, gap: 16, paddingBottom: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 24 },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: palette.acai, fontWeight: '700' },
});
