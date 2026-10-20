import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Header, useToast } from '../src/components/ui';
import { reportError } from '../src/crash/reporter';
import { VersionMark } from '../src/diagnostics/VersionMark';
import { screenColumn, spacing, useTheme } from '../src/theme';

const SUPPORT_EMAIL = 'contato@eguaadota.app';

export default function SupportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();

  function writeEmail() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'support:mailto' });
      Clipboard.setStringAsync(SUPPORT_EMAIL)
        .then(() => toast.show('Não achei um app de e-mail. Copiei o endereço para você.', 'info'))
        .catch((copyError: unknown) => {
          reportError(copyError, { source: 'handled', where: 'support:copy' });
          toast.show(`Não achei um app de e-mail. Escreva para ${SUPPORT_EMAIL}.`, 'info');
        });
    });
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <Header title="Suporte" large onBack={() => router.back()} />
        <View style={styles.body}>
          <AppText selectable style={styles.center}>
            Escreva para {SUPPORT_EMAIL}. A gente responde sobre conta, denúncia e verificação de
            ONG.
          </AppText>
          <Button title={SUPPORT_EMAIL} icon="mail" size="lg" onPress={writeEmail} />
          <VersionMark />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, ...screenColumn },
  body: { alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  center: { textAlign: 'center' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
