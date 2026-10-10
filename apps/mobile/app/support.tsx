import { useRouter } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, Header } from '../src/components/ui';
import { VersionMark } from '../src/diagnostics/VersionMark';
import { Mascot } from '../src/mascot';
import { screenColumn, spacing, useTheme } from '../src/theme';

const SUPPORT_EMAIL = 'contato@eguaadota.app';

export default function SupportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <Header title="Suporte" large onBack={() => router.back()} />
        <View style={styles.body}>
          <Mascot pose="wave" />
          <AppText style={styles.center}>
            Escreva para {SUPPORT_EMAIL}. A gente responde sobre conta, denúncia e verificação de
            ONG.
          </AppText>
          <Button
            title={SUPPORT_EMAIL}
            icon="mail"
            size="lg"
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
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
