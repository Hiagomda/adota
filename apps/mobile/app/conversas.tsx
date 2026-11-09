import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import { lastLine } from '../src/chat/chatRules';
import {
  AppText,
  Avatar,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  SkeletonRows,
  Touchable,
} from '../src/components/ui';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

interface MyThread {
  id: string;
  postId: string;
  adopterId: string;
  role: 'author' | 'adopter';
  animalName: string | null;
  species: string;
  lastBody: string | null;
  lastAt: string | null;
  lastMine: boolean;
  closed: boolean;
  other: { id: string; name: string; handle: string; avatarUrl: string | null };
}

const speciesWord: Record<string, string> = { dog: 'cachorro', cat: 'gato' };

function whenLabel(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** Todas as conversas de adoção da pessoa, de qualquer animal, a mais recente primeiro. */
export default function ConversationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const threads = useQuery({
    queryKey: ['my-adoption-chats', token],
    enabled: Boolean(token),
    queryFn: () => api<{ threads: MyThread[] }>('/me/adoption-chats', { token }),
    refetchInterval: 15000,
  });

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.column}>
        <Header
          title="Conversas"
          subtitle="Adoção pelo app · telefone oculto · monitoradas"
          onBack={() => router.back()}
        />
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={threads.isRefetching}
              onRefresh={() => void threads.refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {!token ? (
            <EmptyState
              pose="login"
              title="Entre para ver suas conversas"
              body="As conversas de adoção ficam ligadas à sua conta."
            />
          ) : threads.isLoading ? (
            <SkeletonRows />
          ) : threads.isError ? (
            <ErrorState
              title="Não consegui abrir as conversas"
              body={messageFrom(threads.error)}
              onRetry={() => void threads.refetch()}
            />
          ) : (threads.data?.threads.length ?? 0) === 0 ? (
            <EmptyState
              pose="chat"
              title="Nenhuma conversa ainda"
              body='Toque em "Quero adotar" num animal para conversar com quem cuida. Quem publica vê aqui quem quer adotar.'
            />
          ) : (
            (threads.data?.threads ?? []).map((item) => {
              const animal =
                item.animalName?.trim() || `um ${speciesWord[item.species] ?? 'animal'}`;
              return (
                <Touchable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Conversa com ${item.other.name} sobre ${animal}`}
                  onPress={() =>
                    router.push(
                      item.role === 'author'
                        ? `/chat/${item.postId}?with=${item.adopterId}`
                        : `/chat/${item.postId}`,
                    )
                  }
                  style={styles.thread}
                >
                  <Avatar name={item.other.name} uri={item.other.avatarUrl} />
                  <View style={styles.threadText}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {item.other.name}
                    </AppText>
                    <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                      {item.role === 'author' ? `Quer adotar ${animal}` : `Sobre ${animal}`}
                    </AppText>
                    <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
                      {item.closed ? 'Conversa encerrada pela equipe' : lastLine(item)}
                    </AppText>
                  </View>
                  <View style={styles.side}>
                    {item.lastAt ? (
                      <AppText variant="caption" color="textSecondary">
                        {whenLabel(item.lastAt)}
                      </AppText>
                    ) : null}
                    <Icon name="chevron-right" size="sm" color={colors.textSecondary} />
                  </View>
                </Touchable>
              );
            })
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, ...screenColumn },
  list: { paddingBottom: spacing.xxl },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  threadText: { flex: 1, gap: 2 },
  side: { alignItems: 'flex-end', gap: spacing.xs },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
