import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadFeed, loadMe, messageFrom } from '../../src/api';
import { neighborhoodOf } from '../../src/animalLabels';
import { PostGrid } from '../../src/components/profile/PostGrid';
import { ProfileHeader } from '../../src/components/profile/ProfileHeader';
import {
  ActionCard,
  AppText,
  Avatar,
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
import { screenColumn, spacing, useTheme } from '../../src/theme';
import type { VolunteerStatus } from '../../src/volunteer/types';

type ProfileTab = 'posts' | 'saved' | 'adopted';

const tabOptions = [
  { value: 'posts', label: 'Publicações' },
  { value: 'saved', label: 'Salvos' },
  { value: 'adopted', label: 'Adotados' },
] as const;

const MAX_HIGHLIGHTS = 6;
const HIGHLIGHT_WIDTH = 76;

/** Só os números do perfil público que o cabeçalho usa. */
interface PublicProfile {
  counts: { posts: number; helped: number; rescued?: number; followers: number };
}

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
  // Os números do cabeçalho vêm do perfil público, o mesmo que os outros veem.
  const publicProfile = useQuery({
    queryKey: ['user', me.data?.handle],
    queryFn: () => api<PublicProfile>(`/users/${me.data?.handle ?? ''}`, { token }),
    enabled: Boolean(me.data?.handle),
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
              void publicProfile.refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          {/* Barra do topo como no Instagram: o @ da conta e os ajustes. */}
          <View style={styles.topBar}>
            <AppText variant="h3" numberOfLines={1} style={styles.topTitle}>
              {me.data ? `@${me.data.handle}` : 'Perfil'}
            </AppText>
            <IconButton
              icon="settings"
              accessibilityLabel="Ajustes"
              onPress={() => router.push('/settings')}
            />
          </View>
          <ProfileHeader
            name={me.data?.name ?? 'Sua conta'}
            avatarUrl={me.data?.avatarUrl}
            verified={me.data?.verified}
            subtitle={[level?.name, me.data?.city].filter(Boolean).join(' · ') || null}
            stats={[
              { value: publicProfile.data?.counts.posts ?? 0, label: 'publicações' },
              { value: publicProfile.data?.counts.followers ?? 0, label: 'seguidores' },
              {
                value: publicProfile.data?.counts.rescued ?? publicProfile.data?.counts.helped ?? 0,
                label: 'saíram da rua',
              },
            ]}
          >
            {token ? (
              <>
                <Button
                  title="Editar perfil"
                  variant="outline"
                  onPress={() => router.push('/settings')}
                  style={styles.grow}
                />
                <Button
                  title="Minha rede"
                  icon="users"
                  variant="outline"
                  onPress={() => router.push('/voluntario')}
                  style={styles.grow}
                />
              </>
            ) : null}
          </ProfileHeader>
          {me.data?.verified && (me.data.role === 'ngo' || me.data.role === 'protector') ? (
            <View style={styles.network}>
              <ActionCard
                title="Painel da ONG"
                description="Fichas de adoção, animais, campanhas e agenda"
                icon="grid"
                tone="primary"
                onPress={() => router.push('/painel-ong')}
              />
            </View>
          ) : null}
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
          {highlights.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.highlights}
            >
              {/* Destaques como os do Instagram: bolha com anel e o bairro embaixo. */}
              {highlights.map((post) => (
                <Touchable
                  key={post.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver resgate urgente em ${post.approxLabel}`}
                  pressedScale={0.94}
                  onPress={() => router.push(`/story/${post.id}`)}
                  style={styles.highlight}
                >
                  <Avatar
                    name={post.approxLabel}
                    uri={post.media[0]?.thumbUrl}
                    size="lg"
                    ring="story"
                  />
                  <AppText variant="caption" numberOfLines={1} style={styles.highlightLabel}>
                    {neighborhoodOf(post.approxLabel)}
                  </AppText>
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
          <PostGrid posts={posts.data?.posts ?? []} />
          {!token ? (
            <EmptyState
              pose="login"
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
              pose={tab === 'adopted' ? 'home' : tab === 'saved' ? 'saved' : 'camera'}
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
                title="Sair da conta"
                icon="log-out"
                variant="outline"
                fullWidth
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  topTitle: { flex: 1 },
  grow: { flex: 1 },
  network: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  highlights: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  highlight: { width: HIGHLIGHT_WIDTH, alignItems: 'center', gap: spacing.xs },
  highlightLabel: { textAlign: 'center', alignSelf: 'stretch' },
  tabs: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  logout: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
