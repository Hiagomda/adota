import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadFeed, loadMe, messageFrom } from '../../src/api';
import {
  ActionCard,
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  ProgressBar,
  Segmented,
  SkeletonRows,
  Touchable,
} from '../../src/components/ui';
import { VersionMark } from '../../src/diagnostics/VersionMark';
import { useSession } from '../../src/session';
import { motion, screenColumn, spacing, useTheme } from '../../src/theme';
import type { VolunteerStatus } from '../../src/volunteer/types';

type ProfileTab = 'posts' | 'saved' | 'adopted';

const tabOptions = [
  { value: 'posts', label: 'Publicações' },
  { value: 'saved', label: 'Salvos' },
  { value: 'adopted', label: 'Adotados' },
] as const;

const MAX_HIGHLIGHTS = 6;
// Hairline gap between the 3 columns of the grid.
const CELL_GAP = spacing.xs / 4;

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const logout = useSession((state) => state.logout);
  const [tab, setTab] = useState<ProfileTab>('posts');
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
  const level = volunteer.data?.level;
  const xp = volunteer.data?.xp ?? 0;
  const remaining = level && level.ceiling !== null ? Math.max(level.ceiling - xp, 0) : null;
  const search =
    tab === 'saved'
      ? '?saved=true&limit=30'
      : tab === 'adopted'
        ? '?adopted=true&limit=30'
        : me.data
          ? `?authorId=${me.data.id}&limit=30`
          : '';
  const posts = useQuery({
    queryKey: ['profile-posts', token, tab, me.data?.id],
    queryFn: () => loadFeed(token, search),
    enabled: Boolean(token && (tab !== 'posts' || me.data)),
  });
  const highlights = (posts.data?.posts ?? [])
    .filter((post) => post.urgency === 'high')
    .slice(0, MAX_HIGHLIGHTS);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={
              Boolean(token) && (me.isRefetching || posts.isRefetching || volunteer.isRefetching)
            }
            onRefresh={() => {
              void me.refetch();
              void posts.refetch();
              void volunteer.refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <View style={styles.head}>
            <Avatar
              name={me.data?.name ?? 'Sua conta'}
              uri={me.data?.avatarUrl}
              size="xl"
              verified={me.data?.verified}
            />
            <View style={styles.headText}>
              <AppText variant="h1" numberOfLines={1}>
                {me.data?.name ?? 'Sua conta'}
              </AppText>
              {me.data ? (
                <AppText color="textSecondary" numberOfLines={1}>
                  @{me.data.handle}
                </AppText>
              ) : null}
              {me.data?.verified ? <Badge kind="label" label="Verificado" tone="primary" /> : null}
            </View>
            <IconButton
              icon="settings"
              accessibilityLabel="Ajustes"
              onPress={() => router.push('/settings')}
            />
          </View>
          {token && level ? (
            <View style={styles.network}>
              <Card elevation="md">
                <ProgressBar
                  value={level.progress}
                  label={level.name}
                  caption={
                    remaining === null
                      ? `${xp} XP · você chegou no topo`
                      : `${xp} XP · faltam ${remaining} para o próximo`
                  }
                />
              </Card>
            </View>
          ) : null}
          <View style={styles.network}>
            <ActionCard
              title="Minha rede"
              description="Lar temporário e selos"
              icon="users"
              tone="primary"
              onPress={() => router.push('/voluntario')}
            />
          </View>
          {highlights.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.highlights}
            >
              {highlights.map((post) => (
                <Touchable
                  key={post.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver resgate urgente em ${post.approxLabel}`}
                  pressedScale={0.94}
                  onPress={() => router.push(`/story/${post.id}`)}
                >
                  <Avatar name={post.approxLabel} uri={post.media[0]?.thumbUrl} size="lg" />
                </Touchable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.tabs}>
            <Segmented
              variant="underline"
              accessibilityLabel="Seções do perfil"
              options={tabOptions}
              value={tab}
              onChange={setTab}
            />
          </View>
          <View style={styles.grid}>
            {(posts.data?.posts ?? []).map((post) => (
              <Touchable
                key={post.id}
                accessibilityRole="button"
                accessibilityLabel={`Abrir resgate em ${post.approxLabel}`}
                pressedScale={0.97}
                style={styles.cell}
                onPress={() => router.push(`/post/${post.id}`)}
              >
                <View style={[styles.cellFill, { backgroundColor: colors.surfaceMuted }]}>
                  {post.media[0] ? (
                    <Image
                      source={{ uri: post.media[0].thumbUrl }}
                      style={styles.cellImage}
                      contentFit="cover"
                      transition={motion.base}
                      cachePolicy="memory-disk"
                      recyclingKey={post.id}
                    />
                  ) : null}
                </View>
              </Touchable>
            ))}
          </View>
          {!token ? (
            <EmptyState
              pose="wave"
              title="Entre para ver seu perfil"
              body="Seus resgates, os que você salvou e as adoções concluídas ficam ligados à sua conta."
              actionLabel="Entrar"
              onAction={() =>
                router.push({ pathname: '/login', params: { returnTo: '/(tabs)/profile' } })
              }
            />
          ) : me.isLoading || posts.isLoading ? (
            <SkeletonRows />
          ) : me.isError || posts.isError ? (
            <ErrorState
              title="Não consegui abrir seu perfil"
              body={messageFrom(me.error ?? posts.error)}
              onRetry={() => {
                void me.refetch();
                void posts.refetch();
              }}
            />
          ) : (posts.data?.posts.length ?? 0) === 0 ? (
            <EmptyState
              pose={tab === 'adopted' ? 'home' : 'sad'}
              title={
                tab === 'posts'
                  ? 'Você ainda não publicou'
                  : tab === 'saved'
                    ? 'Nada salvo'
                    : 'Nenhuma adoção por aqui'
              }
              body={
                tab === 'posts'
                  ? 'O primeiro resgate que você publicar aparece nesta grade.'
                  : tab === 'saved'
                    ? 'Toque em salvar num resgate para guardar ele aqui.'
                    : 'Quando um resgate chegar em adotado, a foto fica nesta aba.'
              }
              actionLabel={tab === 'posts' ? 'Criar resgate' : undefined}
              onAction={tab === 'posts' ? () => router.push('/create') : undefined}
            />
          ) : null}
          {token ? (
            <View style={styles.logout}>
              <Button
                title="Sair"
                icon="log-out"
                variant="ghost"
                onPress={() => {
                  void logout().then(() => router.replace('/'));
                }}
              />
            </View>
          ) : null}
          <VersionMark />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxl },
  column: screenColumn,
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  headText: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  network: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  highlights: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  tabs: { paddingHorizontal: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1, padding: CELL_GAP },
  cellFill: { flex: 1 },
  cellImage: { width: '100%', height: '100%' },
  logout: { alignItems: 'center', paddingTop: spacing.lg },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
