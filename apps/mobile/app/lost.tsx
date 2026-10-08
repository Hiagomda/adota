import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../src/api';
import { useSession } from '../src/session';
import { palette, screenColumn, useTheme } from '../src/theme';
import type { Post } from '../src/types';
import { EmptyState, PostCard, SkeletonCard } from '../src/ui';

const emptyPosts: Post[] = [];

export default function LostScreen() {
  const theme = useTheme();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
            <Text style={{ color: theme.text, fontSize: 16 }}>Voltar</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Animais perdidos</Text>
          <Text style={[styles.note, { color: theme.muted }]}>
            Se o seu sumiu, a gente te ajuda a procurar.
          </Text>
        </View>
        {feed.isLoading ? (
          <SkeletonCard />
        ) : feed.isError ? (
          <EmptyState
            pose="sad"
            title="Não consegui carregar os perdidos"
            body={messageFrom(feed.error)}
            actionLabel="Tentar de novo"
            onAction={() => void feed.refetch()}
          />
        ) : (
          <FlashList
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            data={feed.data?.posts ?? emptyPosts}
            keyExtractor={(post) => post.id}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching}
                onRefresh={() => void feed.refetch()}
                tintColor={theme.text}
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
          <Pressable
            accessibilityRole="button"
            style={[styles.publish, { marginBottom: insets.bottom + 12 }]}
            onPress={() => router.push('/create?kind=lost')}
          >
            <Text style={styles.publishText}>Publicar animal perdido</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, ...screenColumn },
  header: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700' },
  note: { fontSize: 14, lineHeight: 20 },
  publish: {
    marginHorizontal: 16,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishText: { color: palette.acai, fontSize: 16, fontWeight: '700' },
});
