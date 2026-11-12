import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messageFrom } from '../../src/api';
import { Button, Card, ErrorState, Header, SkeletonRows } from '../../src/components/ui';
import { loadFeedPoint } from '../../src/feedPoints/api';
import { FeedPointDetails } from '../../src/feedPoints/FeedPointDetails';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/** Um ponto solidário, aberto pelo aviso de "está vazio" ou pelo link compartilhado. */
export default function FeedPointScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const found = useQuery({
    queryKey: ['feed-points', 'one', id, token],
    queryFn: () => loadFeedPoint(id, token),
  });
  const point = found.data?.point;
  const mine = Boolean(point && 'mine' in point && point.mine);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Header title="Ponto solidário" onBack={() => router.back()} />
          <View style={styles.body}>
            {found.isLoading ? (
              <SkeletonRows />
            ) : point ? (
              <>
                <Card elevation="md">
                  <FeedPointDetails point={point} mine={mine} onHidden={() => router.back()} />
                </Card>
                <Button
                  title="Ver pontos no mapa"
                  icon="map"
                  variant="outline"
                  fullWidth
                  onPress={() => router.push('/(tabs)/explore')}
                />
              </>
            ) : (
              <ErrorState
                title="Não consegui abrir o ponto"
                body={messageFrom(found.error)}
                onRetry={() => void found.refetch()}
              />
            )}
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
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
