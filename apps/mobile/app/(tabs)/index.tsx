import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, loadMe, loadNotifications, messageFrom } from '../../src/api';
import { animalHeadline, placeOf } from '../../src/animalLabels';
import { PostCard } from '../../src/components/PostCard';
import {
  AppText,
  Avatar,
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  SearchBar,
  SectionHeader,
  SkeletonCard,
  Touchable,
} from '../../src/components/ui';
import { onFeedRefresh } from '../../src/feedRefresh';
import { distanceLabel } from '../../src/format';
import { useViewerLocation, type DeviceFix } from '../../src/place/deviceLocation';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';
import { logBestEffort } from '../../src/crash/bestEffort';

const emptyPosts: Post[] = [];
const STORY_WIDTH = 76;

type HomeLens = 'all' | 'dog' | 'cat' | 'urgent';

const lenses: { id: HomeLens; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'dog', label: 'Cães' },
  { id: 'cat', label: 'Gatos' },
  { id: 'urgent', label: 'Urgentes' },
];
function postKey(post: Post): string {
  return post.id;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function placeDistance(post: Post, here: DeviceFix | null): string {
  const place = placeOf(post.approxLabel);
  const away = distanceLabel(here, post.location);
  return away ? `${place} · ${away}` : place;
}

const Stories = memo(function Stories({ posts, here }: { posts: Post[]; here: DeviceFix | null }) {
  const router = useRouter();
  if (posts.length === 0) return null;
  return (
    <View>
      <SectionHeader
        title="Urgentes agora"
        actionLabel="Ver no mapa"
        onAction={() => router.navigate('/explore')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stories}
      >
        {posts.map((post) => {
          const place = placeOf(post.approxLabel);
          const label = placeDistance(post, here);
          return (
            <Touchable
              key={post.id}
              accessibilityRole="button"
              accessibilityLabel={`Resgate urgente em ${label}`}
              pressedScale={0.94}
              onPress={() => router.push(`/story/${post.id}`)}
              style={styles.story}
            >
              <Avatar name={place} uri={post.media[0]?.thumbUrl} size="lg" ring="urgent" />
              <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                {label}
              </AppText>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
});

function matchesLens(post: Post, lens: HomeLens, seek: string): boolean {
  if (lens === 'dog' && post.animal.species !== 'dog') return false;
  if (lens === 'cat' && post.animal.species !== 'cat') return false;
  if (lens === 'urgent' && post.urgency !== 'high') return false;
  const needle = seek.trim().toLowerCase();
  if (!needle) return true;
  return `${animalHeadline(post.animal)} ${post.approxLabel} ${post.description} ${post.author.name}`
    .toLowerCase()
    .includes(needle);
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [seek, setSeek] = useState('');
  const [lens, setLens] = useState<HomeLens>('all');
  const here = useViewerLocation();

  const feed = useQuery({
    queryKey: ['posts', token],
    queryFn: () => loadFeed(token, '?limit=20'),
  });
  const stories = useQuery({
    queryKey: ['stories', token],
    queryFn: () => loadFeed(token, '?urgency=high&status=open&limit=12'),
  });
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const notifications = useQuery({
    queryKey: ['notifications', token],
    queryFn: () => loadNotifications(token ?? ''),
    enabled: Boolean(token),
  });

  const keep = useCallback((post: Post) => matchesLens(post, lens, seek), [lens, seek]);
  const storyPosts = (stories.data?.posts ?? emptyPosts).filter(
    (post) => !post.helpRequest && keep(post),
  );
  const feedPosts = (feed.data?.posts ?? emptyPosts).filter(
    (post) => !post.helpRequest && post.type !== 'help_request' && keep(post),
  );
  const unreadNotifications = (notifications.data?.notifications ?? []).some(
    (item) => item.readAt === null,
  );
  const refetchFeed = feed.refetch;
  const pageGeneration = useRef(0);

  const like = useCallback(
    async (post: Post) => {
      if (!token) return;
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
        logBestEffort('home:haptic'),
      );
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

  const failedCursor = useRef<string | null>(null);
  const loadMore = useCallback(async () => {
    const cursor = feed.data?.nextCursor;
    if (!cursor || cursor === failedCursor.current || feed.isFetching) return;
    const ticket = pageGeneration.current;
    try {
      const page = await loadFeed(token, `?limit=20&cursor=${encodeURIComponent(cursor)}`);
      if (ticket !== pageGeneration.current) return;
      failedCursor.current = null;
      client.setQueryData(
        ['posts', token],
        (current: { posts: Post[]; nextCursor: string | null } | undefined) => {
          if (!current) return current;
          const seen = new Set(current.posts.map((item) => item.id));
          return {
            posts: [...current.posts, ...page.posts.filter((item) => !seen.has(item.id))],
            nextCursor: page.nextCursor,
          };
        },
      );
    } catch {
      failedCursor.current = cursor;
    }
  }, [client, feed.data?.nextCursor, feed.isFetching, token]);

  const refreshAll = useCallback(() => {
    pageGeneration.current += 1;
    failedCursor.current = null;
    void feed.refetch();
    void stories.refetch();
    if (token) {
      void me.refetch();
      void notifications.refetch();
    }
  }, [feed, me, notifications, stories, token]);

  useEffect(() => {
    return onFeedRefresh(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      refreshAll();
    });
  }, [refreshAll]);

  const renderPost = useCallback(
    ({ item }: { item: Post }) => (
      <View style={styles.column}>
        <PostCard post={item} onOpen={openPost} onLike={like} />
      </View>
    ),
    [like, openPost],
  );

  const header = (
    <View>
      <View style={[styles.mast, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.mastRow}>
          <Avatar name={me.data?.name ?? 'Você'} uri={me.data?.avatarUrl} size="md" />
          <View style={styles.heroText}>
            <AppText variant="caption" color="textSecondary">
              {greeting()}
            </AppText>
            <AppText variant="h2" numberOfLines={1}>
              {me.data?.name ? firstName(me.data.name) : 'Égua, adota!'}
            </AppText>
          </View>
          <View>
            <IconButton
              icon="bell"
              accessibilityLabel={
                unreadNotifications ? 'Notificações. Você tem novidades' : 'Notificações'
              }
              onPress={() => router.push('/alerts')}
            />
            {unreadNotifications ? (
              <View style={styles.unread} pointerEvents="none">
                <Badge kind="dot" accessibilityLabel="Notificações não lidas" />
              </View>
            ) : null}
          </View>
        </View>
        <SearchBar
          value={seek}
          onChangeText={setSeek}
          placeholder="Buscar animal, bairro ou pessoa"
          accessibilityLabel="Buscar animal, bairro ou pessoa"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {lenses.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            selected={lens === item.id}
            onPress={() => setLens(item.id)}
          />
        ))}
        {/* Shortcuts to their own screens, after the filters of this list. */}
        <Chip label="Adoção" icon="home" onPress={() => router.push('/adocao')} />
        <Chip label="Perdidos" icon="search" onPress={() => router.push('/lost')} />
      </ScrollView>
      <Stories posts={storyPosts} here={here} />
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlashList
        ref={listRef}
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        data={feedPosts}
        keyExtractor={postKey}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching}
            onRefresh={refreshAll}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressViewOffset={insets.top}
          />
        }
        ListHeaderComponent={header}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          <View style={styles.column}>
            {feed.isLoading ? (
              <SkeletonCard />
            ) : feed.isError ? (
              <ErrorState
                title="Não consegui carregar os resgates"
                body={messageFrom(feed.error)}
                onRetry={() => void feed.refetch()}
              />
            ) : (
              <EmptyState
                pose="sad"
                title="Nenhum resgate por aqui"
                body="Belém está quieta neste momento. Se você viu um animal na rua, publique para a rede ajudar."
                actionLabel="Criar resgate"
                onAction={() => router.push('/create')}
              />
            )}
          </View>
        }
        renderItem={renderPost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: screenColumn,
  mast: {
    ...screenColumn,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  mastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1 },
  unread: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  // Vertical padding keeps the chips' 4 px hit slop inside the scroll view.
  chips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    alignItems: 'center',
  },
  stories: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  story: { width: STORY_WIDTH, alignItems: 'center', gap: spacing.xs },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
