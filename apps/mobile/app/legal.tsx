import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';

export default function LegalScreen() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: theme.text }}>Voltar</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Termos</Text>
        <Text style={{ color: theme.muted, lineHeight: 22 }}>
          Égua, adota! é uma rede para resgate de animais de rua em Belém. É proibido anunciar venda
          de animal. O app não recebe pagamento: quando um perfil verificado mostra uma chave Pix, a
          transferência acontece fora da plataforma. Quem publica é responsável pela veracidade do
          resgate.
        </Text>
        <Text style={[styles.title, { color: theme.text }]}>Privacidade</Text>
        <Text style={{ color: theme.muted, lineHeight: 22 }}>
          Guardamos conta, fotos, textos e a localização do resgate. Quem vê o resgate no app recebe a
          localização aproximada em cerca de 500 metros. O ponto exato e o telefone, se a pessoa autorizou o
          WhatsApp, só aparecem para quem vai ajudar, para o autor e para a moderação. Você pode
          excluir a conta em Ajustes. A exclusão anonimiza o perfil e apaga telefone, foto e tokens
          de notificação.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  back: { minHeight: 44, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
});
