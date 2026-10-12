import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  Icon,
  IconButton,
  OrgCard,
  PhotoScrim,
  ProgressBar,
  SearchBar,
  SectionHeader,
  SkeletonCard,
  SkeletonRail,
  StatusPill,
  Touchable,
  type IconName,
} from '../../src/components/ui';
import { onFeedRefresh } from '../../src/feedRefresh';
import { distanceKmBetween, distanceLabel, formatWhen } from '../../src/format';
import { useViewerLocation, type DeviceFix } from '../../src/place/deviceLocation';
import { useSession } from '../../src/session';
import { radius, screenColumn, size, spacing, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';
import { badgeArt } from '../../src/volunteer/badgeArt';
import type { VolunteerStatus } from '../../src/volunteer/types';

const emptyPosts: Post[] = [];
const STORY_WIDTH = 76;
const CATEGORY_SIZE = 64;

type HomeLens = 'all' | 'dog' | 'cat' | 'urgent';

const lenses: { id: HomeLens; label: string; icon: IconName }[] = [
  { id: 'all', label: 'Tudo', icon: 'grid' },
  { id: 'dog', label: 'Cães', icon: 'heart' },
  { id: 'cat', label: 'Gatos', icon: 'heart' },
  { id: 'urgent', label: 'Urgentes', icon: 'alert-circle' },
];
const MAX_ORGS = 8;
const MAX_SEALS = 3;
const SEAL_SIZE = 72;
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

const Stories = memo(function Stories({
  posts,
  here,
}: {
  posts: Post[];
  here: DeviceFix | null;
}) {
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
  const adoptionY = useRef(0);
  const campaignY = useRef(0);
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

  const keep = useCallback((post: Post) => matchesLens(post, lens, seek), [lens, seek]);
  const storyPosts = (stories.data?.posts ?? emptyPosts).filter(
    (post) => post.helpRequest?.kind !== 'transport' && keep(post),
  );
  const adoptionPosts = (adoption.data?.posts ?? emptyPosts).filter(keep);
  const campaignPosts = (campaigns.data?.posts ?? emptyPosts).filter(
    (post) => post.helpRequest?.kind !== 'transport' && keep(post),
  );
  const feedPosts = (feed.data?.posts ?? emptyPosts).filter(
    (post) => post.helpRequest?.kind !== 'transport' && keep(post),
  );
  const featured = storyPosts[0] ?? feedPosts[0] ?? null;
  const nearbyPosts = feedPosts
    .filter((post) => post.id !== featured?.id)
    .sort((a, b) =>
      here ? distanceKmBetween(here, a.location) - distanceKmBetween(here, b.location) : 0,
    )
    .slice(0, 8);
  const resumePosts = feedPosts.filter((post) => post.saved || post.viewerWillHelp);
  const city = me.data?.city?.trim() || 'Belém';
  const levelProgress = volunteer.data
    ? volunteer.data.level.progress > 1
      ? volunteer.data.level.progress / 100
      : volunteer.data.level.progress
    : 0;
  const orgs = collectOrgs([...feedPosts, ...adoptionPosts, ...campaignPosts]);
  const unreadNotifications = (notifications.data?.notifications ?? []).some(
    (item) => item.readAt === null,
  );
  const seals = useMemo(
    () =>
      (volunteer.data?.badges ?? [])
        .filter((badge) => badge.unlockedAt !== null && badge.code !== 'good_pilot')
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

  const refreshAll = useCallback(() => {
    void feed.refetch();
    void stories.refetch();
    void adoption.refetch();
    void campaigns.refetch();
    if (token) {
      void me.refetch();
      void volunteer.refetch();
      void notifications.refetch();
    }
  }, [adoption, campaigns, feed, me, notifications, stories, token, volunteer]);

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
              accessibilityLabel={unreadNotifications ? 'Notificações. Você tem novidades' : 'Notificações'}
              onPress={() => router.push('/alerts')}
            />
            {unreadNotifications ? (
              <View style={styles.unread} pointerEvents="none">
                <Badge kind="dot" accessibilityLabel="Notificações não lidas" />
              </View>
            ) : null}
          </View>
        </View>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`Animais perto de ${city}, Pará. Abrir o mapa`}
          pressedScale={0.98}
          onPress={() => router.push('/explore')}
          style={[styles.placeChip, { backgroundColor: colors.primarySoft }]}
        >
          <Icon name="map-pin" size="sm" color={colors.onPrimarySoft} />
          <AppText variant="bodySmallStrong" style={{ color: colors.onPrimarySoft }} numberOfLines={1}>
            Animais perto de: {city}, PA
          </AppText>
        </Touchable>
        <SearchBar
          value={seek}
          onChangeText={setSeek}
          placeholder="Buscar animal, bairro ou pessoa"
          accessibilityLabel="Buscar animal, bairro ou pessoa"
        />
      </View>

      <View style={styles.column}>
        <View style={styles.lenses}>
          {lenses.map((item) => {
            const selected = lens === item.id;
            return (
              <Touchable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label}
                pressedScale={0.94}
                onPress={() => setLens(item.id)}
                style={styles.lens}
              >
                <View
                  style={[
                    styles.lensCircle,
                    { backgroundColor: selected ? colors.primary : colors.surface },
                  ]}
                >
                  <Icon name={item.icon} color={selected ? colors.onPrimary : colors.primary} />
                </View>
                <AppText variant="caption" numberOfLines={1}>
                  {item.label}
                </AppText>
              </Touchable>
            );
          })}
        </View>

        <View style={styles.shortcuts}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Adotar"
            pressedScale={0.94}
            onPress={() => scrollTo(adoptionY.current)}
            style={styles.shortcut}
          >
            <View style={[styles.lensCircle, { backgroundColor: colors.secondarySoft }]}>
              <Icon name="heart" color={colors.secondary} />
            </View>
            <AppText variant="caption">Adotar</AppText>
          </Touchable>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Casa Amiga"
            pressedScale={0.94}
            onPress={() => router.push('/voluntario')}
            style={styles.shortcut}
          >
            <View style={[styles.lensCircle, { backgroundColor: colors.primarySoft }]}>
              <Icon name="home" color={colors.primary} />
            </View>
            <AppText variant="caption">Casa Amiga</AppText>
          </Touchable>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Doar"
            pressedScale={0.94}
            onPress={() => scrollTo(campaignY.current)}
            style={styles.shortcut}
          >
            <View style={[styles.lensCircle, { backgroundColor: colors.infoSoft }]}>
              <Icon name="gift" color={colors.info} />
            </View>
            <AppText variant="caption">Doar</AppText>
          </Touchable>
        </View>

        {featured ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Conhecer ${animalHeadline(featured.animal)}`}
            pressedScale={0.98}
            onPress={() => openPost(featured.id)}
            style={[styles.feature, { backgroundColor: colors.surfaceMuted }]}
          >
            {featured.media[0] ? (
              <Image
                source={{ uri: featured.media[0].url }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel={`Foto de ${animalHeadline(featured.animal)}`}
              />
            ) : null}
            <PhotoScrim stop={0.28} />
            <View style={styles.featureCopy}>
              <StatusPill urgency={featured.urgency} />
              <AppText variant="display" color="onMedia" numberOfLines={2}>
                {animalHeadline(featured.animal)}
              </AppText>
              <AppText variant="body" color="onMedia" numberOfLines={2}>
                {placeDistance(featured, here)}
              </AppText>
              <View style={[styles.cta, { backgroundColor: colors.secondary }]}>
                <AppText variant="button" numberOfLines={1} style={{ color: colors.onSecondary }}>
                  Conhecer {firstName(animalHeadline(featured.animal))}
                </AppText>
              </View>
            </View>
          </Touchable>
        ) : null}

        <Stories posts={storyPosts.filter((post) => post.id !== featured?.id)} here={here} />

        {nearbyPosts.length > 0 ? (
          <View>
            <SectionHeader title="Perto de você" subtitle="O lugar mostrado é aproximado" />
            <Rail>
              {nearbyPosts.map((post, index) => (
                <AnimalCard
                  key={post.id}
                  index={index}
                  photoUri={post.media[0]?.thumbUrl ?? post.media[0]?.url}
                  title={animalHeadline(post.animal)}
                  subtitle={placeDistance(post, here)}
                  status={post.status}
                  urgency={post.urgency}
                  onPress={() => openPost(post.id)}
                />
              ))}
            </Rail>
          </View>
        ) : null}

        {resumePosts.length > 0 ? (
          <View>
            <SectionHeader title="Continue de onde parou" subtitle="Salvos e resgates em que você entrou" />
            <Rail>
              {resumePosts.map((post, index) => (
                <AnimalCard
                  key={post.id}
                  index={index}
                  variant="compact"
                  photoUri={post.media[0]?.thumbUrl ?? post.media[0]?.url}
                  title={animalHeadline(post.animal)}
                  subtitle={post.viewerWillHelp ? 'Você vai ajudar' : 'Salvo'}
                  status={post.status}
                  onPress={() => openPost(post.id)}
                />
              ))}
            </Rail>
          </View>
        ) : null}

        <View onLayout={(event) => (adoptionY.current = event.nativeEvent.layout.y)}>
          <SectionHeader
            title="Animais esperando por você"
            subtitle="Prontos para um lar"
            actionLabel="Publicar"
            onAction={() => router.push({ pathname: '/create', params: { kind: 'adoption' } })}
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
              body="Quando um resgate chegar a essa fase, ou alguém publicar para adoção, ele aparece aqui."
              actionLabel="Publicar para adoção"
              onAction={() => router.push({ pathname: '/create', params: { kind: 'adoption' } })}
            />
          ) : (
            <Rail>
              {adoptionPosts.map((post, index) => (
                <AnimalCard
                  key={post.id}
                  index={index}
                  photoUri={post.media[0]?.thumbUrl ?? post.media[0]?.url}
                  title={animalHeadline(post.animal)}
                  subtitle={[placeDistance(post, here), sexLabel[post.animal.sex]]
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
            subtitle="Pedidos da equipe. O app não recebe o dinheiro."
            actionLabel={me.data?.role === 'admin' ? 'Pedir doação' : undefined}
            onAction={me.data?.role === 'admin' ? () => router.push('/doar') : undefined}
          />
          {campaigns.isLoading ? (
            <SkeletonRail
              width={size.orgCard.width + spacing.xxl}
              height={size.animalCompact.height}
            />
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
                    place={placeDistance(post, here)}
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

        {token && volunteer.data ? (
          <View style={styles.impactPad}>
            <HeroSurface curved={false} style={styles.impact}>
              <AppText variant="caption" color="onHeroMuted">
                Seu impacto
              </AppText>
              <AppText variant="display" color="onHero">
                {volunteer.data.xp} XP
              </AppText>
              <AppText variant="body" color="onHero">
                Nível {volunteer.data.level.name}
              </AppText>
              <ProgressBar
                tone="hero"
                value={levelProgress}
                caption={
                  volunteer.data.level.ceiling
                    ? `${volunteer.data.xp} / ${volunteer.data.level.ceiling}`
                    : volunteer.data.level.name
                }
              />
            </HeroSurface>
          </View>
        ) : null}

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
  mast: { ...screenColumn, gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  mastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1 },
  unread: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  placeChip: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  lenses: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  lens: { width: CATEGORY_SIZE + spacing.lg, alignItems: 'center', gap: spacing.xs },
  lensCircle: {
    width: CATEGORY_SIZE,
    height: CATEGORY_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcuts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
  },
  shortcut: { width: CATEGORY_SIZE + spacing.xxl, alignItems: 'center', gap: spacing.xs },
  feature: {
    marginHorizontal: spacing.lg,
    height: size.homeFeature,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  featureCopy: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.sm,
  },
  cta: {
    alignSelf: 'flex-start',
    minHeight: size.touch,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  impactPad: { paddingHorizontal: spacing.lg },
  impact: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm },
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
