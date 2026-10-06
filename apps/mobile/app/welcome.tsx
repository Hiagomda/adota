import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../src/session';
import { palette, screenColumn, useTheme } from '../src/theme';

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const finishWelcome = useSession((state) => state.finishWelcome);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.column}>
      <Text style={[styles.title, { color: theme.text }]}>Égua, adota!</Text>
      <Text style={[styles.body, { color: theme.text }]}>
        Uma rede para quem encontra, resgata e acolhe animais de rua em Belém. As fotos vêm
        primeiro. A localização pública fica aproximada.
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => {
          void finishWelcome().then(() => router.replace('/permissions'));
        }}
      >
        <Text style={styles.buttonText}>Começar</Text>
      </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'flex-end' },
  column: { ...screenColumn, padding: 24, gap: 16, paddingBottom: 24 },
  title: { fontSize: 36, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 25 },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: palette.acai, fontSize: 17, fontWeight: '700' },
});
