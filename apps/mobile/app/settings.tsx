import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const logout = useSession((state) => state.logout);
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function saveQuiet() {
    await api('/me', {
      method: 'PATCH',
      token,
      body: { quietHoursStart: 22, quietHoursEnd: 7, alertRadiusKm: 15 },
    });
    setMessage('Silêncio das 22h às 7h e raio de 15 km salvos.');
  }

  async function verify() {
    await api('/me/verification', {
      method: 'POST',
      token,
      body: { organizationName: organization, note: 'Atuo em Belém.' },
    });
    setMessage('Pedido enviado. A equipe analisa antes de liberar o Pix no perfil.');
  }

  async function removeAccount() {
    await api('/me', { method: 'DELETE', token });
    await logout();
    router.replace('/login');
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: theme.text }}>Voltar</Text>
      </Pressable>
      <Text style={[styles.title, { color: theme.text }]}>Ajustes</Text>
      <Pressable onPress={() => void saveQuiet()}>
        <Text style={{ color: theme.accent }}>Ativar silêncio noturno e raio de 15 km</Text>
      </Pressable>
      <TextInput
        value={organization}
        onChangeText={setOrganization}
        placeholder="Nome da ONG ou proteção"
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, borderColor: theme.line }]}
      />
      <Pressable onPress={() => void verify()}>
        <Text style={{ color: theme.accent }}>Pedir verificação</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void api('/fosters', {
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
          }).then(() => setMessage('Lar temporário registrado no centro de Belém, raio de 8 km.'))
        }
      >
        <Text style={{ color: theme.accent }}>Oferecer lar temporário</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/support')}>
        <Text style={{ color: theme.text }}>Suporte</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/legal')}>
        <Text style={{ color: theme.text }}>Termos e privacidade</Text>
      </Pressable>
      <Pressable onPress={() => void removeAccount()}>
        <Text style={{ color: '#E23B3B' }}>Excluir minha conta</Text>
      </Pressable>
      {message ? <Text style={{ color: theme.muted }}>{message}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
