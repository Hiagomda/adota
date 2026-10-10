import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, loadMe, loadNotifications, messageFrom } from '../../src/api';
import { animalHeadline, placeOf, sexLabel } from '../../src/animalLabels';
import { PostCard } from '../../src/components/PostCard';
import {
  AnimalCard,
  AppText,
  Avatar,
  Badge,
  CampaignCard,
  Card,
  EmptyState,
  ErrorState,
  HeroSurface,
  IconButton,
  OrgCard,
  ProgressBar,
  SectionHeader,
  ShortcutCard,
  SkeletonCard,
  SkeletonRail,
  Touchable,
} from '../../src/components/ui';
import { formatWhen } from '../../src/format';
import { useSession } from '../../src/session';
import { radius, screenColumn, size, spacing, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';
import { useLightStatusBar } from '../../src/useLightStatusBar';
import { badgeArt } from '../../src/volunteer/badgeArt';
import type { VolunteerStatus } from '../../src/volunteer/types';

const emptyPosts: Post[] = [];
const STORY_WIDTH = 76;
const MAX_ORGS = 8;
const MAX_SEALS = 3;
const SEAL_SIZE = 72;
const LEVEL_PLACEHOLDER_HEIGHT = 20;

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

interface OrgSummary {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  verified: boolean;
  rescues: number;
}

/** Verified profiles, NGOs and protectors seen in the posts, the busiest first. */
function collectOrgs(posts: Post[]): OrgSummary[] {
  const byId = new Map<string, OrgSummary>();
  for (const post of posts) {
    const { author } = post;
    const isOrg = author.verified || author.role === 'ngo' || author.role === 'protector';
    if (!isOrg) continue;
    const known = byId.get(author.id);
    if (known) known.rescues += 1;
    else {
      byId.set(author.id, {
        id: author.id,
        name: author.name,
        handle: author.handle,
        avatarUrl: author.avatarUrl,
        verified: author.verified,
        rescues: 1,
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.rescues - a.rescues).slice(0, MAX_ORGS);
}

interface HeroProps {
  name: string | null;
  hasToken: boolean;
  volunteer: { data: VolunteerStatus | undefined; isLoading: boolean; isError: boolean };
  unread: boolean;
  onNotifications: () => void;
  onLost: () => void;
}

const Hero = memo(function Hero({
  name,
  hasToken,
  volunteer,
  unread,
  onNotifications,
  onLost,
}: HeroProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const level = volunteer.data?.level;
  const xp = volunteer.data?.xp ?? 0;
  const remaining = level && level.ceiling !== null ? Math.max(level.ceiling - xp, 0) : null;
  const title = name ? `${greeting()}, ${firstName(name)}!` : `${greeting()}!`;
  return (
    <HeroSurface
      style={[
        styles.hero,
        { paddingTop: insets.top + spacing.md, paddingBottom: size.curve + spacing.giant },
      ]}
    >
      <View style={styles.heroColumn}>
        <View style={styles.heroTop}>
          <Avatar name={name ?? 'Você'} size="lg" ring="light" />
          <View style={styles.heroText}>
            <AppText variant="bodySmall" color="onHeroMuted" numberOfLines={1}>
              Égua, adota!
            </AppText>
            <AppText variant="h1" color="onHero" numberOfLines={1}>
              {title}
            </AppText>
          </View>
          <IconButton
            icon="search"
            variant="hero"
            accessibilityLabel="Animais perdidos"
            onPress={onLost}
          />
          <View>
            <IconButton
              icon="bell"
              variant="hero"
              accessibilityLabel={unread ? 'Notificações. Você tem novidades' : 'Notificações'}
              onPress={onNotifications}
            />
            {unread ? (
              <View style={styles.unread} pointerEvents="none">
                <Badge kind="dot" accessibilityLabel="Notificações não lidas" />
              </View>
            ) : null}
          </View>
        </View>

        {hasToken ? (
          <View style={styles.level}>
            {volunteer.isLoading ? (
              <View
                accessible
                accessibilityLabel="Carregando seu nível"
                style={[styles.levelPlaceholder, { backgroundColor: colors.heroTrack }]}
              />
            ) : volunteer.isError || !level ? (
              <AppText variant="bodySmall" color="onHeroMuted">
                Não consegui carregar seu nível. Puxe a tela para baixo para tentar de novo.
              </AppText>
            ) : (
              <>
                <View style={styles.levelRow}>
                  <View style={styles.levelName}>
                    <AppText variant="caption" color="onHeroMuted">
                      Seu nível
                    </AppText>
                    <AppText variant="h2" color="onHero" numberOfLines={1}>
                      {level.name}
                    </AppText>
                  </View>
                  <View style={styles.xp}>
                    <AppText variant="stat" color="onHero">
                      {xp}
                    </AppText>
                    <AppText variant="bodySmallStrong" color="onHeroMuted">
                      XP
                    </AppText>
                  </View>
                </View>
                <ProgressBar
                  tone="hero"
                  value={level.progress}
                  label="Rumo ao próximo nível"
                  caption={
                    remaining === null ? 'Você chegou no topo' : `Faltam ${remaining} XP`
                  }
                />
              </>
            )}
          </View>
        ) : (
          <AppText variant="body" color="onHeroMuted" style={styles.welcome}>
            Belém tem bichinho esperando por você. Cada ajuda conta.
          </AppText>
        )}
      </View>
    </HeroSurface>
  );
});

const Stories = memo(function Stories({ posts }: { posts: Post[] }) {
  const router = useRouter();
  if (posts.length === 0) return null;
  return (
    <>
      <SectionHeader title="Pedindo socorro agora" subtitle="Toque para ver a história" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stories}
      >
        {posts.map((post) => {
          const place = placeOf(post.approxLabel);
          return (
            <Touchable
              key={post.id}
              accessibilityRole="button"
              accessibilityLabel={`Resgate urgente em ${place}`}
              pressedScale={0.94}
              onPress={() => router.push(`/story/${post.id}`)}
              style={styles.story}
            >
              <Avatar name={place} uri={post.media[0]?.thumbUrl} size="lg" ring="urgent" />
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {place}
              </AppText>
            </Touchable>
          );
        })}
      </ScrollView>
    </>
  );
});

function Rail({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {children}
    </ScrollView>
  );
}

export default function HomeScreen() {
  useLightStatusBar();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const listRef = useRef<FlashListRef<Post>>(null);
  const adoptionY = useRef(0);
  const campaignY = useRef(0);

  const feed = useQuery({
    queryKey: ['posts', token],
    queryFn: () => loadFeed(token, '?limit=20'),
  });
  const stories = useQuery({
    queryKey: ['stories', token],
    queryFn: () => loadFeed(token, '?urgency=high&status=open&limit=12'),
  });
  const adoption = useQuery({
    queryKey: ['home-adoption', token],
    queryFn: () => loadFeed(token, '?status=for_adoption&limit=10'),
  });
  const campaigns = useQuery({
    queryKey: ['home-campaigns', token],
    queryFn: () => loadFeed(token, '?type=help_request&limit=6'),
  });
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const volunteer = useQuery({
    queryKey: ['volunteer', token],
    queryFn: () => api<VolunteerStatus>('/volunteers/me', { token }),
    enabled: Boolean(token),
  });
  const notifications = useQuery({
    queryKey: ['notifications', token],
    queryFn: () => loadNotifications(token ?? ''),
    enabled: Boolean(token),
  });

  const storyPosts = stories.data?.posts ?? emptyPosts;
  const adoptionPosts = adoption.data?.posts ?? emptyPosts;
  const campaignPosts = campaigns.data?.posts ?? emptyPosts;
  const feedPosts = feed.data?.posts ?? emptyPosts;
  const orgs = useMemo(
    () => collectOrgs([...feedPosts, ...adoptionPosts, ...campaignPosts]),
    [feedPosts, adoptionPosts, campaignPosts],
  );
  const unreadNotifications = (notifications.data?.notifications ?? []).some(
    (item) => item.readAt === null,
  );
  const seals = useMemo(
    () =>
      (volunteer.data?.badges ?? [])
        .filter((badge) => badge.unlockedAt !== null)
        .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
        .slice(0, MAX_SEALS),
    [volunteer.data],
  );
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

  function scrollTo(offset: number) {
    listRef.current?.scrollToOffset({ offset, animated: true });
  }

  function refreshAll() {
    void feed.refetch();
    void stories.refetch();
    void adoption.refetch();
    void campaigns.refetch();
    if (token) {
      void me.refetch();
      void volunteer.refetch();
      void notifications.refetch();
    }
  }

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
      <Hero
        name={me.data?.name ?? null}
        hasToken={Boolean(token)}
        volunteer={{
          data: volunteer.data,
          isLoading: volunteer.isLoading,
          isError: volunteer.isError,
        }}
        unread={unreadNotifications}
        onNotifications={() => router.push('/alerts')}
        onLost={() => router.push('/lost')}
      />
      <View style={[styles.column, styles.pullUp]}>
        <View style={styles.shortcuts}>
          <ShortcutCard
            label="Adotar"
            icon="heart"
            tone="secondary"
            index={0}
            onPress={() => scrollTo(adoptionY.current)}
          />
          <ShortcutCard
            label="Casa Amiga"
            icon="home"
            tone="primary"
            index={1}
            onPress={() => router.push('/voluntario')}
          />
          <ShortcutCard
            label="Transporte"
            icon="truck"
            tone="caramel"
            index={2}
            onPress={() => router.push('/voluntario')}
          />
          <ShortcutCard
            label="Doar"
            icon="gift"
            tone="info"
            index={3}
            onPress={() => scrollTo(campaignY.current)}
          />
        </View>

        <Stories posts={storyPosts} />

        <View onLayout={(event) => (adoptionY.current = event.nativeEvent.layout.y)}>
          <SectionHeader
            title="Animais esperando por você"
            subtitle="Resgatados e prontos para um lar"
          />
          {adoption.isLoading ? (
            <SkeletonRail width={size.animalLarge.width} height={size.animalLarge.height} />
          ) : adoption.isError ? (
            <ErrorState
              compact
              title="Não consegui buscar os animais"
              body={messageFrom(adoption.error)}
              onRetry={() => void adoption.refetch()}
            />
          ) : adoptionPosts.length === 0 ? (
            <EmptyState
              compact
              pose="home"
              title="Nenhum bichinho para adoção agora"
              body="Quando um resgate chegar a essa fase, ele aparece aqui."
            />
          ) : (
            <Rail>
              {adoptionPosts.map((post, index) => (
                <AnimalCard
                  key={post.id}
                  index={index}
                  photoUri={post.media[0]?.thumbUrl ?? post.media[0]?.url}
                  title={animalHeadline(post.animal)}
                  subtitle={[placeOf(post.approxLabel), sexLabel[post.animal.sex]]
                    .filter(Boolean)
                    .join(' · ')}
                  status={post.status}
                  onPress={() => openPost(post.id)}
                />
              ))}
            </Rail>
          )}
        </View>

        {orgs.length > 0 ? (
          <>
            <SectionHeader title="ONGs e protetores" subtitle="Quem mais resgata por aqui" />
            <Rail>
              {orgs.map((org, index) => (
                <OrgCard
                  key={org.id}
                  index={index}
                  name={org.name}
                  subtitle={`@${org.handle} · ${org.rescues === 1 ? '1 resgate' : `${org.rescues} resgates`}`}
                  avatarUri={org.avatarUrl}
                  verified={org.verified}
                  onPress={() => router.push(`/user/${org.handle}`)}
                />
              ))}
            </Rail>
          </>
        ) : null}

        <View onLayout={(event) => (campaignY.current = event.nativeEvent.layout.y)}>
          <SectionHeader
            title="Campanhas"
            subtitle="Pedidos de ajuda de perfis verificados"
          />
          {campaigns.isLoading ? (
            <SkeletonRail width={size.orgCard.width + spacing.xxl} height={size.animalCompact.height} />
          ) : campaigns.isError ? (
            <ErrorState
              compact
              title="Não consegui buscar as campanhas"
              body={messageFrom(campaigns.error)}
              onRetry={() => void campaigns.refetch()}
            />
          ) : campaignPosts.length === 0 ? (
            <EmptyState
              compact
              pose="search"
              title="Nenhuma campanha aberta"
              body="Quando uma ONG verificada pedir ajuda, o pedido aparece aqui."
            />
          ) : (
            <Rail>
              {campaignPosts.map((post, index) =>
                post.helpRequest ? (
                  <CampaignCard
                    key={post.id}
                    index={index}
                    kind={post.helpRequest.kind}
                    place={placeOf(post.approxLabel)}
                    goalAmount={post.helpRequest.goalAmount}
                    deadline={post.helpRequest.deadline}
                    createdAt={post.createdAt}
                    onPress={() => openPost(post.id)}
                  />
                ) : null,
              )}
            </Rail>
          )}
        </View>

        {token ? (
          <>
            <SectionHeader
              title="Suas conquistas"
              actionLabel="Ver todas"
              onAction={() => router.push('/voluntario')}
            />
            {volunteer.isLoading ? (
              <SkeletonRail width={SEAL_SIZE + spacing.xxxl} height={SEAL_SIZE + spacing.xxxl} />
            ) : seals.length === 0 ? (
              <EmptyState
                compact
                pose="wave"
                title="Seu primeiro selo está logo ali"
                body="Ajude um resgate e ele aparece aqui."
                actionLabel="Ver como ganhar"
                onAction={() => router.push('/voluntario')}
              />
            ) : (
              <View style={styles.sealsWrap}>
                <Card elevation="md">
                  <View style={styles.seals}>
                    {seals.map((badge) => {
                      const Art = badgeArt[badge.code];
                      return (
                        <View
                          key={badge.code}
                          accessible
                          accessibilityLabel={`${badge.name}, conquistado ${badge.unlockedAt ? formatWhen(badge.unlockedAt) : ''}`}
                          style={styles.seal}
                        >
                          <Art size={SEAL_SIZE} />
                          <AppText variant="caption" numberOfLines={2} style={styles.sealName}>
                            {badge.name}
                          </AppText>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </View>
            )}
          </>
        ) : null}

        <SectionHeader title="Resgates acontecendo" subtitle="Do mais urgente ao mais tranquilo" />
      </View>
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
  hero: { width: '100%', paddingHorizontal: spacing.lg },
  heroColumn: { ...screenColumn, gap: spacing.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1 },
  unread: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  level: { gap: spacing.md },
  levelPlaceholder: { height: LEVEL_PLACEHOLDER_HEIGHT, borderRadius: radius.pill },
  levelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  levelName: { flex: 1 },
  xp: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  welcome: { paddingRight: spacing.xl },
  // The block climbs over the header by the room the hero leaves for it. The pull is on the block,
  // not on the shortcuts, so they stay inside their parent and keep receiving touches on Android.
  pullUp: { marginTop: -spacing.giant },
  shortcuts: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg },
  stories: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  story: { width: STORY_WIDTH, alignItems: 'center', gap: spacing.xs },
  // Room above and below so the soft shadows of the cards are not clipped by the carousel.
  rail: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  sealsWrap: { paddingHorizontal: spacing.lg },
  seals: { flexDirection: 'row', justifyContent: 'space-around', gap: spacing.md },
  seal: { flex: 1, alignItems: 'center', gap: spacing.sm },
  sealName: { textAlign: 'center' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
