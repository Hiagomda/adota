import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '../src/api';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme';

const quickAccounts = [
  { label: 'Maria', email: 'maria@egua.local' },
  { label: 'Patas de Belém', email: 'patas@egua.local' },
  { label: 'Admin', email: 'admin@egua.local' },
];

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const login = useSession((state) => state.login);
  const [email, setEmail] = useState('maria@egua.local');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enter(nextEmail: string) {
    setPending(true);
    setError(null);
    try {
      await login(nextEmail);
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não consegui entrar. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Entrar</Text>
      <Text style={{ color: theme.muted }}>
        Google e Apple entram quando o Firebase deste projeto estiver configurado. Sem o arquivo,
        use o e-mail.
      </Text>
      <Pressable
        style={[styles.social, { borderColor: theme.line }]}
        onPress={() =>
          setError('O login com Google precisa do arquivo do Firebase neste aparelho.')
        }
      >
        <Text style={{ color: theme.text }}>Continuar com Google</Text>
      </Pressable>
      <Pressable
        style={[styles.social, { borderColor: theme.line }]}
        onPress={() => setError('O login com Apple precisa do arquivo do Firebase neste aparelho.')}
      >
        <Text style={{ color: theme.text }}>Continuar com Apple</Text>
      </Pressable>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="E-mail"
        placeholderTextColor={theme.muted}
        style={[styles.input, { color: theme.text, borderColor: theme.line }]}
      />
      <Pressable style={styles.button} disabled={pending} onPress={() => void enter(email)}>
        <Text style={styles.buttonText}>{pending ? 'Entrando...' : 'Entrar com e-mail'}</Text>
      </Pressable>
      <View style={styles.quick}>
        {quickAccounts.map((account) => (
          <Pressable key={account.email} onPress={() => void enter(account.email)}>
            <Text style={{ color: theme.accent }}>{account.label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700' },
  social: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#FF6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  quick: { flexDirection: 'row', gap: 16 },
  error: { color: '#E23B3B' },
});
