import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../src/components/ui';
import { screenColumn, spacing, useTheme } from '../src/theme';

/**
 * Link quebrado, antigo ou digitado errado. Antes caía na tela padrão do Expo, em inglês e com
 * link para o mapa de rotas internas.
 */
export default function NotFoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <EmptyState
          pose="search"
          title="Não achei essa tela"
          body="O link pode estar antigo ou ter mudado. Volte ao início que eu te mostro o caminho."
          actionLabel="Voltar ao início"
          onAction={() => router.replace('/')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, justifyContent: 'center', padding: spacing.lg, ...screenColumn },
});
