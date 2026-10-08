import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const logout = useSession((state) => state.logout);
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function run(task: () => Promise<unknown>, success: string) {
    if (!token) {
      setMessage('Entre na sua conta para continuar.');
      return;
    }
    try {
      await task();
      setMessage(success);
    } catch (error) {
      setMessage(messageFrom(error));
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Pressable style={styles.row} onPress={() => router.back()}>
          <Text style={{ color: theme.text }}>Voltar</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Ajustes</Text>
        <Pressable
          style={styles.row}
          onPress={() =>
            void run(
              () =>
                api('/me', {
                  method: 'PATCH',
                  token,
                  body: { quietHoursStart: 22, quietHoursEnd: 7, alertRadiusKm: 15 },
                }),
              'Silêncio das 22h às 7h e raio de 15 km salvos.',
            )
          }
        >
          <Text style={{ color: theme.text }}>Ativar silêncio noturno e raio de 15 km</Text>
        </Pressable>
        <TextInput
          value={organization}
          onChangeText={setOrganization}
          placeholder="Nome da ONG ou proteção"
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.text, borderColor: theme.line }]}
        />
        <Pressable
          style={styles.row}
          onPress={() =>
            void run(
              () =>
                api('/me/verification', {
                  method: 'POST',
                  token,
                  body: { organizationName: organization, note: 'Atuo em Belém.' },
                }),
              'Pedido enviado. A equipe analisa antes de liberar o Pix no perfil.',
            )
          }
        >
          <Text style={{ color: theme.text }}>Pedir verificação</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() =>
            void run(
              () =>
                api('/fosters', {
                  method: 'POST',
                  token,
                  body: {
                    capacity: 2,
                    speciesAccepted: ['dog', 'cat'],
                    sizesAccepted: ['small', 'medium'],
                    latitude: -1.4558,
                    longitude: -48.5039,
                    radiusKm: 8,
                  },
                }),
              'Lar temporário registrado no centro de Belém, raio de 8 km.',
            )
          }
        >
          <Text style={{ color: theme.text }}>Oferecer lar temporário</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/support')}>
          <Text style={{ color: theme.text }}>Suporte</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/legal')}>
          <Text style={{ color: theme.text }}>Termos e privacidade</Text>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() =>
            void run(async () => {
              await api('/me', { method: 'DELETE', token });
              await logout();
              router.replace('/');
            }, 'Conta excluída.')
          }
        >
          <Text style={{ color: '#E23B3B' }}>Excluir minha conta</Text>
        </Pressable>
        {message ? <Text style={{ color: theme.muted }}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: '700' },
  row: { minHeight: 44, justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
