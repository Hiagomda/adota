import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadNotifications, messageFrom } from '../../src/api';
import {
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  Header,
  ListItem,
  SkeletonRows,
} from '../../src/components/ui';
import { useSession } from '../../src/session';
import { screenColumn, spacing, statusLabel, useTheme } from '../../src/theme';
import type { AppNotification } from '../../src/types';

function notificationBody(body: string | undefined): string {
  if (!body) return '';
  return body.replace(
    /agora está: (on_the_way|not_found|for_adoption|fostered|rescued|adopted|open)\b/g,
    (_match, status: string) => `agora está: ${statusLabel[status] ?? 'atualizado'}`,
  );
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

export default function AlertsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', token],
    queryFn: () => (token ? loadNotifications(token) : Promise.resolve({ notifications: [] })),
    enabled: Boolean(token),
  });
  const groups = new Map<string, AppNotification[]>();
  for (const item of query.data?.notifications ?? []) {
    const label = dayLabel(item.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  const sections = [...groups.entries()].map(([title, data]) => ({ title, data }));

  async function open(item: AppNotification) {
    if (token) {
      await api('/notifications/read', { method: 'POST', token });
      await client.invalidateQueries({ queryKey: ['notifications', token] });
    }
    if (item.payload.postId) router.push(`/post/${item.payload.postId}`);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.column}>
        <Header title="Notificações" large />
        {!token ? (
          <EmptyState
            pose="wave"
            title="Entre para ver os avisos"
            body="As notificações de resgates perto de você aparecem depois que você entra na conta."
          />
        ) : query.isLoading ? (
          <SkeletonRows />
        ) : (
          <SectionList
            style={styles.screen}
            contentContainerStyle={styles.list}
            sections={sections}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              query.isError ? (
                <ErrorState
                  title="Não consegui buscar as notificações"
                  body={messageFrom(query.error)}
                  onRetry={() => void query.refetch()}
                />
              ) : (
                <EmptyState
                  pose="sit"
                  title="Tudo quieto"
                  body="Quando um resgate perto de você precisar de gente, o aviso aparece aqui."
                />
              )
            }
            renderSectionHeader={({ section }) => (
              <View style={[styles.day, { backgroundColor: colors.background }]}>
                <AppText variant="bodySmallStrong" color="textSecondary">
                  {section.title}
                </AppText>
              </View>
            )}
            renderItem={({ item }) => (
              <ListItem
                title={item.payload.title ?? 'Atualização'}
                subtitle={notificationBody(item.payload.body)}
                icon="bell"
                accessibilityLabel={`${item.readAt ? '' : 'Não lida. '}${item.payload.title ?? 'Atualização'}. ${notificationBody(item.payload.body)}`}
                trailing={
                  item.readAt ? null : <Badge kind="dot" accessibilityLabel="Não lida" />
                }
                onPress={() => void open(item)}
              />
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, ...screenColumn },
  list: { paddingBottom: spacing.xxl },
  day: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
