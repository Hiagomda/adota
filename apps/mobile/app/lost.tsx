import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../src/api';
import { PostCard } from '../src/components/PostCard';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Header,
  SkeletonCard,
} from '../src/components/ui';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';
import type { Post } from '../src/types';

const emptyPosts: Post[] = [];

export default function LostScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const feed = useQuery({
    queryKey: ['posts', 'lost', token],
    queryFn: () => loadFeed(token, '?type=lost&limit=20'),
  });
  const refetchFeed = feed.refetch;

  const like = useCallback(
    async (post: Post) => {
      if (!token) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      client.setQueryData(['posts', 'lost', token], (current: { posts: Post[] } | undefined) =>
        current
          ? {
              ...current,
              posts: current.posts.map((item) =>
                item.id === post.id
                  ? {
                      ...item,
                      liked: !item.liked,
                      counts: { ...item.counts, likes: item.counts.likes + (item.liked ? -1 : 1) },
                    }
                  : item,
              ),
            }
          : current,
      );
      try {
        await api(`/posts/${post.id}/like`, { method: 'POST', token });
      } catch {
        void refetchFeed();
      }
    },
    [client, refetchFeed, token],
  );

  const openPost = useCallback(
    (id: string) => {
      router.push(`/post/${id}`);
    },
    [router],
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.column}>
        <Header title="Animais perdidos" onBack={() => router.back()} />
        <AppText color="textSecondary" style={styles.intro}>
          Se o seu sumiu, a gente te ajuda a procurar.
        </AppText>
        {feed.isLoading ? (
          <SkeletonCard />
        ) : feed.isError ? (
          <ErrorState
            title="Não consegui carregar os perdidos"
            body={messageFrom(feed.error)}
            onRetry={() => void feed.refetch()}
          />
        ) : (
          <FlashList
            style={styles.screen}
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
            data={feed.data?.posts ?? emptyPosts}
            keyExtractor={(post) => post.id}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching}
                onRefresh={() => void feed.refetch()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              <EmptyState
                pose="search"
                title="Por aqui, ninguém sumiu agora"
                body="Se o seu desapareceu, publica a foto. Quem estiver perto pode ter visto."
                actionLabel="Publicar animal perdido"
                onAction={() => router.push('/create?kind=lost')}
              />
            }
            renderItem={({ item }) => <PostCard post={item} onOpen={openPost} onLike={like} />}
          />
        )}
        {(feed.data?.posts.length ?? 0) > 0 ? (
          <View style={[styles.publish, { paddingBottom: insets.bottom + spacing.md }]}>
            <Button
              title="Publicar animal perdido"
              icon="plus"
              fullWidth
              onPress={() => router.push('/create?kind=lost')}
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
  intro: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  publish: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
