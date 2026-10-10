import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Header } from '../src/components/ui';
import { VersionMark } from '../src/diagnostics/VersionMark';
import { screenColumn, spacing, useTheme } from '../src/theme';

export default function LegalScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Header title="Termos e privacidade" onBack={() => router.back()} />
          <View style={styles.content}>
            <AppText variant="h1">Termos</AppText>
            <AppText color="textSecondary">
              Égua, adota! é uma rede para resgate de animais de rua em Belém. É proibido anunciar
              venda de animal. O app não recebe pagamento: quando um perfil verificado mostra uma
              chave Pix, a transferência acontece fora da plataforma. Quem publica é responsável
              pela veracidade do resgate.
            </AppText>
            <AppText variant="h1">Privacidade</AppText>
            <AppText color="textSecondary">
              Guardamos conta, fotos, textos e a localização do resgate. Quem vê o resgate no app
              recebe a localização aproximada em cerca de 500 metros. O ponto exato e o telefone, se
              a pessoa autorizou o WhatsApp, só aparecem para quem vai ajudar, para o autor e para a
              moderação. Você pode excluir a conta em Ajustes. A exclusão anonimiza o perfil e apaga
              telefone, foto e tokens de notificação.
            </AppText>
            <VersionMark />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  content: { padding: spacing.lg, gap: spacing.md },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
