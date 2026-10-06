import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';

export default function SupportScreen() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: theme.text }}>Voltar</Text>
      </Pressable>
      <Text style={[styles.title, { color: theme.text }]}>Suporte</Text>
      <Text style={{ color: theme.muted, fontSize: 17, lineHeight: 24 }}>
        Escreva para contato@eguaadota.app. A gente responde sobre conta, denúncia e verificação de
        ONG.
      </Text>
      <Pressable onPress={() => void Linking.openURL('mailto:contato@eguaadota.app')}>
        <Text style={{ color: theme.text, fontSize: 18 }}>contato@eguaadota.app</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
});
