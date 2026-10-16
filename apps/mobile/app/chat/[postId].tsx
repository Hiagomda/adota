import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, EmptyState, Header } from '../../src/components/ui';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/**
 * Conversations moved to WhatsApp, outside the app. This route stays so old notifications and
 * links still land somewhere useful: the animal's page, where the WhatsApp button is.
 */
export default function ChatMovedScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <Header title="Conversa" onBack={() => router.back()} />
        <EmptyState
          pose="wave"
          title="A conversa agora é no WhatsApp"
          body="O app não guarda mais conversas. Abra o animal e toque em falar no WhatsApp."
        />
        {postId ? (
          <View style={styles.action}>
            <Button
              title="Ver o animal"
              icon="arrow-right"
              iconPosition="right"
              fullWidth
              onPress={() => router.replace(`/post/${postId}`)}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, ...screenColumn },
  action: { paddingHorizontal: spacing.xl },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
