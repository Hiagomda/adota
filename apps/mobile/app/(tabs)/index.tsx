import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, loadMe, loadNotifications, messageFrom } from '../../src/api';
import { animalHeadline, neighborhoodOf, placeOf } from '../../src/animalLabels';
import { PostCard } from '../../src/components/PostCard';
import {
  AnimalCard,
  AppText,
  Avatar,
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  HeroCarousel,
  Icon,
  IconButton,
  SearchBar,
  SectionHeader,
  SkeletonCard,
  SkeletonRail,
  Touchable,
  useToast,
  type HeroSlide,
} from '../../src/components/ui';
import { openCreateCamera } from '../../src/createCamera';
import { FairCard } from '../../src/events/FairCard';
import { useFairs } from '../../src/events/useFairs';
import { adoptionQuery, noAdoptionFilters } from '../../src/post/adoptionQuery';
import { ageBandOf, ageBands } from '../../src/post/care';
import { onFeedRefresh } from '../../src/feedRefresh';
import { distanceKmBetween, distanceLabel } from '../../src/format';
import { useViewerLocation, type DeviceFix } from '../../src/place/deviceLocation';
import { useSession } from '../../src/session';
import { radius, screenColumn, size, spacing, useTheme } from '../../src/theme';
import { canChooseScheme, toggleColorScheme } from '../../src/theme/schemeChoice';
import type { Post } from '../../src/types';
import { logBestEffort } from '../../src/crash/bestEffort';
import { Mascot } from '../../src/mascot';

const emptyPosts: Post[] = [];
const STORY_WIDTH = 76;
/** Quantos animais para adoção se revezam no banner do topo. */
const HERO_SLIDES = 5;
/** "Perto de mim agora": até onde a faixa de urgentes procura primeiro. */
const NEARBY_KM = 2;

/** Arredonda o ponto do celular para uns 100 m, para a busca de perto não refazer a cada leitura do GPS. */
function nearbyKey(here: DeviceFix | null): string | null {
  if (!here) return null;
  return `${here.latitude.toFixed(3)},${here.longitude.toFixed(3)}`;
}

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

const Stories = memo(function Stories({
  posts,
  here,
  nearby,
  me,
  onCreate,
}: {
  posts: Post[];
  here: DeviceFix | null;
  nearby: boolean;
  me: { name: string; avatarUrl: string | null } | null;
  onCreate: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.storyBlock}>
      <AppText variant="caption" color="textSecondary" style={styles.storyTitle}>
        {posts.length === 0
          ? 'Viu um animal precisando de ajuda?'
          : nearby
            ? `Urgentes a até ${NEARBY_KM} km de você`
            : 'Urgentes, precisam de ajuda agora'}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stories}
      >
        {/* A primeira bolha é sempre "Publicar", como o "Seu story" dos apps sociais. */}
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Publicar um resgate"
          pressedScale={0.94}
          onPress={onCreate}
          style={styles.story}
        >
          <View>
            <Avatar name={me?.name ?? 'Você'} uri={me?.avatarUrl} size="lg" ring="seen" />
            <View
              style={[
                styles.storyPlus,
                { backgroundColor: colors.primary, borderColor: colors.background },
              ]}
            >
              <Icon name="plus" size="sm" color={colors.onPrimary} />
            </View>
          </View>
          <AppText variant="caption" numberOfLines={1} style={styles.storyLine}>
            Publicar
          </AppText>
        </Touchable>
        {posts.map((post) => {
          const place = neighborhoodOf(post.approxLabel);
          const away = distanceLabel(here, post.location);
          return (
            <Touchable
              key={post.id}
              accessibilityRole="button"
              accessibilityLabel={`Resgate urgente em ${away ? `${place}, ${away}` : place}`}
              pressedScale={0.94}
              onPress={() => router.push(`/story/${post.id}`)}
              style={styles.story}
            >
              <Avatar name={place} uri={post.media[0]?.thumbUrl} size="lg" ring="story" />
              <View style={styles.storyText}>
                <AppText variant="caption" numberOfLines={1} style={styles.storyLine}>
                  {place}
                </AppText>
                {away ? (
                  <AppText
                    variant="caption"
                    color="textSecondary"
                    numberOfLines={1}
                    style={styles.storyLine}
                  >
                    {away}
                  </AppText>
                ) : null}
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
});

/** Subtítulo do pôster: bairro e faixa de idade, como o ano e o gênero de um título. */
function posterSubtitle(post: Post): string {
  const band = ageBandOf(post.animal.ageEstimate);
  const age = band ? ageBands.find((item) => item.value === band)?.label : null;
  return [placeOf(post.approxLabel), age].filter(Boolean).join(' · ');
}

/** Fileira de pôsteres de adoção que rola para o lado, no estilo dos catálogos de streaming. */
const PosterRail = memo(function PosterRail({
  title,
  subtitle,
  posts,
  loading,
  onSeeAll,
}: {
  title: string;
  subtitle?: string;
  posts: Post[];
  loading: boolean;
  onSeeAll: () => void;
}) {
  const router = useRouter();
  if (!loading && posts.length === 0) return null;
  return (
    <View>
      <SectionHeader title={title} subtitle={subtitle} actionLabel="Ver tudo" onAction={onSeeAll} />
      {loading ? (
        <SkeletonRail width={size.animalCompact.width} height={size.animalCompact.height} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {posts.map((post, index) => (
            <AnimalCard
              key={post.id}
              variant="compact"
              index={index}
              photoUri={post.media[0]?.thumbUrl || post.media[0]?.url}
              title={animalHeadline(post.animal)}
              subtitle={posterSubtitle(post)}
              onPress={() => router.push(`/post/${post.id}`)}
            />
          ))}
        </ScrollView>
      )}
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
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [seek, setSeek] = useState('');
  const [lens, setLens] = useState<HomeLens>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const here = useViewerLocation();
  const toast = useToast();
  const fairs = useFairs(token);
  const nextFair = fairs.data?.events[0] ?? null;
  const fairCount = fairs.data?.events.length ?? 0;

  const feed = useQuery({
    queryKey: ['posts', token],
    queryFn: () => loadFeed(token, '?limit=20'),
  });
  const stories = useQuery({
    queryKey: ['stories', token],
    queryFn: () => loadFeed(token, '?urgency=high&status=open&limit=12'),
  });
  const nearPoint = nearbyKey(here);
  const nearbyStories = useQuery({
    queryKey: ['stories', 'nearby', nearPoint, token],
    queryFn: () => {
      const [latitude, longitude] = (nearPoint ?? '').split(',');
      return loadFeed(
        token,
        `?urgency=high&status=open&limit=12&latitude=${latitude}&longitude=${longitude}&radiusKm=${NEARBY_KM}`,
      );
    },
    enabled: nearPoint !== null,
  });
  const adoption = useQuery({
    queryKey: ['home-adoption', token],
    queryFn: () => loadFeed(token, adoptionQuery(noAdoptionFilters)),
  });
  const adoptionCats = useQuery({
    queryKey: ['home-adoption', 'cat', token],
    queryFn: () => loadFeed(token, adoptionQuery({ ...noAdoptionFilters, species: 'cat' })),
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
  // Os de perto primeiro, quando houver; senão, todo resgate urgente de Belém.
  const closePosts = (nearbyStories.data?.posts ?? emptyPosts)
    .filter((post) => !post.helpRequest && keep(post))
    .sort((a, b) =>
      here ? distanceKmBetween(here, a.location) - distanceKmBetween(here, b.location) : 0,
    );
  const nearbyFirst = closePosts.length > 0;
  const storyPosts = nearbyFirst
    ? closePosts
    : (stories.data?.posts ?? emptyPosts).filter((post) => !post.helpRequest && keep(post));
  const feedPosts = (feed.data?.posts ?? emptyPosts).filter(
    (post) => !post.helpRequest && post.type !== 'help_request' && keep(post),
  );
  const unreadNotifications = (notifications.data?.notifications ?? []).some(
    (item) => item.readAt === null,
  );
  const adoptionPosts = (adoption.data?.posts ?? emptyPosts).filter((post) => keep(post));
  const heroSlides: HeroSlide[] = adoptionPosts.slice(0, HERO_SLIDES).map((post) => ({
    id: post.id,
    photoUri: post.media[0]?.url || post.media[0]?.thumbUrl,
    tag: 'Para adoção',
    title: animalHeadline(post.animal),
    subtitle: posterSubtitle(post),
  }));
  // A fileira de cães começa depois do banner, para as mesmas carinhas não se repetirem logo abaixo.
  const dogPosts = adoptionPosts.filter((post) => post.animal.species === 'dog');
  const dogRail = dogPosts.length > HERO_SLIDES ? dogPosts.slice(HERO_SLIDES) : dogPosts;
  const catRail = (adoptionCats.data?.posts ?? emptyPosts).filter((post) => keep(post));
  const searching = seek.trim().length > 0;
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
    void adoption.refetch();
    void adoptionCats.refetch();
    void fairs.refetch();
    if (nearPoint) void nearbyStories.refetch();
    if (token) {
      void me.refetch();
      void notifications.refetch();
    }
  }, [
    adoption,
    adoptionCats,
    fairs,
    feed,
    me,
    nearPoint,
    nearbyStories,
    notifications,
    stories,
    token,
  ]);

  useEffect(() => {
    return onFeedRefresh(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      refreshAll();
    });
  }, [refreshAll]);

  const startRescue = useCallback(() => {
    const pending = openCreateCamera();
    if (!pending) {
      router.navigate('/create');
      return;
    }
    void pending.then((shot) => {
      if ('canceled' in shot) return;
      router.navigate('/create');
    });
  }, [router]);

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
      <View style={[styles.mast, { paddingTop: insets.top + spacing.xs }]}>
        {/* Barra do topo como num app social: o nome do app à esquerda, ações rápidas à direita. */}
        <View style={styles.mastRow}>
          <Mascot pose="wave" size={size.avatar.md} />
          <View style={styles.heroText}>
            <AppText variant="h2" numberOfLines={1} style={{ color: colors.primary }}>
              Égua, adota!
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {me.data?.name ? `${greeting()}, ${firstName(me.data.name)}` : greeting()}
            </AppText>
          </View>
          <IconButton
            icon={searchOpen ? 'x' : 'search'}
            accessibilityLabel={searchOpen ? 'Fechar busca' : 'Buscar'}
            onPress={() => {
              if (searchOpen) setSeek('');
              setSearchOpen(!searchOpen);
            }}
          />
          {canChooseScheme ? (
            <IconButton
              icon={dark ? 'sun' : 'moon'}
              accessibilityLabel={dark ? 'Usar tema claro' : 'Usar tema escuro'}
              onPress={() => toggleColorScheme(dark ? 'dark' : 'light')}
            />
          ) : null}
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
        {searchOpen ? (
          <SearchBar
            value={seek}
            onChangeText={setSeek}
            placeholder="Buscar animal, bairro ou pessoa"
            accessibilityLabel="Buscar animal, bairro ou pessoa"
          />
        ) : null}
      </View>

      {searching ? null : (
        <Stories
          posts={storyPosts}
          here={here}
          nearby={nearbyFirst}
          me={me.data ? { name: me.data.name, avatarUrl: me.data.avatarUrl ?? null } : null}
          onCreate={startRescue}
        />
      )}

      {/* Atalhos para as telas próprias, como as categorias de um catálogo. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip label="Adoção" icon="home" onPress={() => router.push('/adocao')} />
        <Chip
          label="Adotados"
          icon="smile"
          onPress={() => router.push({ pathname: '/adocao', params: { aba: 'adotados' } })}
        />
        <Chip label="Feiras" icon="calendar" onPress={() => router.push('/feiras')} />
        <Chip label="Perdidos" icon="search" onPress={() => router.push('/lost')} />
        <Chip label="Precisa-se" icon="package" onPress={() => router.push('/precisa-se')} />
      </ScrollView>

      {searching ? null : (
        <>
          <View style={styles.hero}>
            <HeroCarousel slides={heroSlides} actionLabel="Quero conhecer" onOpen={openPost} />
          </View>
          <PosterRail
            title="Cães para adotar"
            posts={dogRail}
            loading={adoption.isLoading}
            onSeeAll={() => router.push('/adocao')}
          />
          <PosterRail
            title="Gatos para adotar"
            posts={catRail}
            loading={adoptionCats.isLoading}
            onSeeAll={() => router.push('/adocao')}
          />
          {nextFair ? (
            <View style={styles.fair}>
              <SectionHeader
                title="Feira de adoção"
                subtitle="Conheça os animais pessoalmente"
                actionLabel={fairCount > 1 ? `Ver as ${fairCount}` : 'Ver feiras'}
                onAction={() => router.push('/feiras')}
              />
              <View style={styles.fairCard}>
                <FairCard
                  fair={nextFair}
                  onOrganizer={(handle) => router.push(`/user/${handle}`)}
                  onError={(message) => toast.show(message, 'error')}
                />
              </View>
            </View>
          ) : null}
        </>
      )}

      <SectionHeader
        title={searching ? 'Resultados' : 'Resgates recentes'}
        subtitle={searching ? undefined : 'Toque duas vezes na foto para curtir'}
      />
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
      </ScrollView>
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
                pose="map"
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
  // O respiro vertical mantém a área de toque extra de 4 px dos chips dentro da rolagem.
  chips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    alignItems: 'center',
  },
  storyBlock: { paddingTop: spacing.xs },
  storyTitle: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  storyPlus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: spacing.xl + 2,
    height: spacing.xl + 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { ...screenColumn, paddingTop: spacing.sm },
  rail: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  stories: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  story: { width: STORY_WIDTH, alignItems: 'center', gap: spacing.xs },
  fair: { ...screenColumn, paddingBottom: spacing.md },
  fairCard: { paddingHorizontal: spacing.lg },
  storyText: { alignSelf: 'stretch', alignItems: 'center' },
  storyLine: { textAlign: 'center' },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
