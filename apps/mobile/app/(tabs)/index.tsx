import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed } from '../../src/api';
import { useSession } from '../../src/session';
import { screenColumn, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';
import { EmptyState, PostCard, SkeletonCard } from '../../src/ui';

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

  async function like(post: Post) {
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
      void feed.refetch();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <View style={styles.column}>
      <Text style={[styles.brand, { color: theme.text }]}>Égua, adota!</Text>
      {feed.isLoading ? (
        <SkeletonCard />
      ) : (
        <FlashList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          data={feed.data?.posts ?? []}
          keyExtractor={(post) => post.id}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefetching}
              onRefresh={() => void feed.refetch()}
              tintColor={theme.text}
            />
          }
          ListHeaderComponent={
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stories}
            >
              {(stories.data?.posts ?? []).map((post) => (
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
          }
          ListEmptyComponent={
            <EmptyState
              title="Nenhum alerta por aqui"
              body="Quando alguém publicar um resgate em Belém, ele aparece neste feed."
            />
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onOpen={() => router.push(`/post/${item.id}`)}
              onLike={() => void like(item)}
            />
          )}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, ...screenColumn },
  brand: { fontSize: 24, fontWeight: '700', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  stories: { paddingHorizontal: 16, paddingBottom: 16, gap: 12, alignItems: 'flex-start' },
  story: { width: 76, alignItems: 'center', gap: 6 },
  storyPhoto: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#E23B3B' },
});
