import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadFeed, messageFrom } from '../src/api';
import { placeOf } from '../src/animalLabels';
import {
  AppText,
  CampaignCard,
  EmptyState,
  ErrorState,
  Header,
  SkeletonRows,
} from '../src/components/ui';
import { openHelpRequests } from '../src/post/helpRequests';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

/** "Precisa-se": what ONGs and protectors need now, ração, remédio, castração. */
export default function NeedsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const needs = useQuery({
    queryKey: ['needs', token],
    queryFn: () => loadFeed(token, '?type=help_request&limit=30'),
  });
  const open = openHelpRequests(needs.data?.posts ?? []);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={needs.isRefetching}
            onRefresh={() => void needs.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header title="Precisa-se" large onBack={() => router.back()} />
          <AppText color="textSecondary" style={styles.intro}>
            Pedidos de ONGs e protetores verificados. A doação vai direto para eles pelo Pix do
            pedido: o app não recebe nem repassa dinheiro.
          </AppText>
          {needs.isLoading ? (
            <View style={styles.list}>
              <SkeletonRows />
            </View>
          ) : needs.isError ? (
            <ErrorState
              title="Não consegui carregar os pedidos"
              body={messageFrom(needs.error)}
              onRetry={() => void needs.refetch()}
            />
          ) : open.length === 0 ? (
            <EmptyState
              pose="bowl"
              title="Nenhum pedido aberto agora"
              body="Quando uma ONG ou protetor verificado pedir ração, remédio ou castração, aparece aqui."
            />
          ) : (
            <View style={styles.list}>
              {open.map((post, index) => (
                <CampaignCard
                  key={post.id}
                  index={index}
                  kind={post.helpRequest?.kind ?? ''}
                  place={`${placeOf(post.approxLabel)} · ${post.author.name}`}
                  goalAmount={post.helpRequest?.goalAmount ?? null}
                  deadline={post.helpRequest?.deadline ?? null}
                  createdAt={post.createdAt}
                  onPress={() => router.push(`/post/${post.id}`)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  intro: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, alignItems: 'center' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
