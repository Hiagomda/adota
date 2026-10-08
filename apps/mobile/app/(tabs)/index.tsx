import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../../src/api';
import { useSession } from '../../src/session';
import { screenColumn, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';
import { Mascot } from '../../src/mascot';
import { EmptyState, PostCard, SkeletonCard } from '../../src/ui';

const emptyPosts: Post[] = [];

function postKey(post: Post): string {
  return post.id;
}

const Stories = memo(function Stories({ posts }: { posts: Post[] }) {
  const theme = useTheme();
  const router = useRouter();
  if (posts.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stories}
    >
      {posts.map((post) => (
        <Pressable
          key={post.id}
          onPress={() => router.push(`/story/${post.id}`)}
          style={styles.story}
        >
          {post.media[0] ? (
            <Image source={{ uri: post.media[0].thumbUrl }} style={styles.storyPhoto} />
          ) : (
            <View style={styles.storyPhoto} />
          )}
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12 }}>
            {post.approxLabel.split(',')[0]}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
});

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const feed = useQuery({
    queryKey: ['posts', token],
    queryFn: () => loadFeed(token, '?limit=20'),
  });
  const stories = useQuery({
    queryKey: ['stories', token],
    queryFn: () => loadFeed(token, '?urgency=high&status=open&limit=12'),
  });
  const storyPosts = stories.data?.posts ?? emptyPosts;
  const header = useMemo(() => <Stories posts={storyPosts} />, [storyPosts]);
  const refetchFeed = feed.refetch;

  const like = useCallback(
    async (post: Post) => {
      if (!token) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      client.setQueryData(['posts', token], (current: { posts: Post[] } | undefined) =>
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

  const renderPost = useCallback(
    ({ item }: { item: Post }) => <PostCard post={item} onOpen={openPost} onLike={like} />,
    [like, openPost],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={styles.column}>
        <View style={styles.brandRow}>
          <View
            style={styles.brand}
            accessible
            accessibilityRole="header"
            accessibilityLabel="Égua, adota!"
          >
            <Mascot pose="sit" size={40} label="Mascote do Égua, adota!" />
            <Text style={[styles.brandText, { color: theme.text }]}>
              <Text style={{ color: theme.accent }}>Égua, </Text>adota!
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Animais perdidos"
            onPress={() => router.push('/lost')}
            style={styles.lost}
          >
            <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '700' }}>Perdidos</Text>
          </Pressable>
        </View>
        {feed.isLoading ? (
          <SkeletonCard />
        ) : feed.isError ? (
            <EmptyState
              pose="sad"
              title="Não consegui carregar os resgates"
              body={messageFrom(feed.error)}
              actionLabel="Tentar de novo"
              onAction={() => void feed.refetch()}
            />
        ) : (
          <FlashList
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            data={feed.data?.posts ?? emptyPosts}
            keyExtractor={postKey}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching}
                onRefresh={() => void feed.refetch()}
                tintColor={theme.text}
              />
            }
            ListHeaderComponent={header}
            ListEmptyComponent={
              <EmptyState
                pose="sad"
                title="Nenhum resgate por aqui"
                body="Belém está quieta neste momento. Se você viu um animal na rua, publique para a rede ajudar."
                actionLabel="Criar resgate"
                onAction={() => router.push('/create')}
              />
            }
            renderItem={renderPost}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, ...screenColumn },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 24, fontWeight: '700' },
  lost: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  stories: { paddingHorizontal: 16, paddingBottom: 16, gap: 12, alignItems: 'flex-start' },
  story: { width: 76, alignItems: 'center', gap: 6 },
  storyPhoto: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#E23B3B' },
});
