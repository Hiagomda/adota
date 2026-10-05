import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme';

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const finishWelcome = useSession((state) => state.finishWelcome);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.accent }]}>Patinha</Text>
      <Text style={[styles.body, { color: theme.text }]}>
        Uma rede para quem encontra, resgata e acolhe animais de rua em Belém. As fotos vêm
        primeiro. A localização pública fica aproximada.
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          void finishWelcome().then(() => router.replace('/login'));
        }}
      >
        <Text style={styles.buttonText}>Começar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end', padding: 24, gap: 16 },
  title: { fontSize: 48, fontWeight: '700' },
  body: { fontSize: 18, lineHeight: 26 },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#FF6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
