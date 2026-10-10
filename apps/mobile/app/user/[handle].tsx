import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../../src/api';
import {
  AppText,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  Header,
  ListItem,
  Notice,
  SkeletonRows,
  StatCard,
  Touchable,
} from '../../src/components/ui';
import { useSession } from '../../src/session';
import { motion, spacing, useTheme } from '../../src/theme';

interface Profile {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  role: string;
  counts: { posts: number; helped: number; followers: number; following: number };
  following: boolean;
}

const reportReasons = [
  'Conteúdo abusivo',
  'Parece venda de animal',
  'Informação falsa',
  'É spam',
] as const;

export default function UserScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const profile = useQuery({
    queryKey: ['user', handle],
    queryFn: () => api<Profile>(`/users/${handle}`, { token }),
  });
  const posts = useQuery({
    queryKey: ['user-posts', profile.data?.id],
    queryFn: () => loadFeed(token, `?authorId=${profile.data?.id}&limit=30`),
    enabled: Boolean(profile.data),
  });
  const person = profile.data;

  async function toggleFollow() {
    if (!person) return;
    if (!token) {
      setNote('Entre na sua conta para seguir.');
      return;
    }
    const next = !person.following;
    client.setQueryData<Profile>(['user', handle], {
      ...person,
      following: next,
      counts: {
        ...person.counts,
        followers: Math.max(0, person.counts.followers + (next ? 1 : -1)),
      },
    });
    try {
      await api(`/users/${person.id}/follow`, { method: next ? 'POST' : 'DELETE', token });
    } catch (error) {
      await client.invalidateQueries({ queryKey: ['user', handle] });
      setNote(messageFrom(error));
    }
  }

  async function block() {
    if (!person || !token) {
      setNote('Entre na sua conta para bloquear.');
      return;
    }
    try {
      await api(`/users/${person.id}/block`, { method: 'POST', token });
      router.back();
    } catch (error) {
      setNote(messageFrom(error));
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title={person ? `@${person.handle}` : 'Perfil'} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || posts.isRefetching}
            onRefresh={() => {
              void profile.refetch();
              void posts.refetch();
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {profile.isLoading ? (
          <SkeletonRows />
        ) : profile.isError || !person ? (
          <ErrorState
            title="Não encontrei essa pessoa"
            body={messageFrom(profile.error)}
            onRetry={() => void profile.refetch()}
          />
        ) : (
          <>
            <View style={styles.head}>
              <Avatar name={person.name} size="xl" verified={person.verified} />
              <View style={styles.headText}>
                <AppText variant="h1" numberOfLines={2}>
                  {person.name}
                </AppText>
                {person.verified ? <Badge kind="label" label="Verificado" tone="primary" /> : null}
              </View>
            </View>
            <View style={styles.stats}>
              <StatCard value={person.counts.posts} label="publicações" icon="image" />
              <StatCard value={person.counts.followers} label="seguidores" icon="users" tone="secondary" />
              <StatCard value={person.counts.helped} label="resgates" icon="heart" tone="success" />
            </View>
            <View style={styles.actions}>
              <Button
                title={person.following ? 'Seguindo' : 'Seguir'}
                icon={person.following ? 'check' : 'user-plus'}
                variant={person.following ? 'outline' : 'primary'}
                onPress={() => void toggleFollow()}
              />
              <Button
                title="Denunciar"
                icon="flag"
                variant="ghost"
                onPress={() => setReportOpen(true)}
              />
              <Button title="Bloquear" icon="slash" variant="ghost" onPress={() => void block()} />
            </View>
            {note ? (
              <View style={styles.note}>
                <Notice message={note} />
              </View>
            ) : null}
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
                        style={styles.image}
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
            {(posts.data?.posts.length ?? 0) === 0 && !posts.isLoading ? (
              <EmptyState
                pose="sit"
                title="Nenhum resgate neste perfil"
                body="Quando esta pessoa publicar, as fotos aparecem aqui."
              />
            ) : null}
          </>
        )}
      </ScrollView>
      <BottomSheet visible={reportOpen} onClose={() => setReportOpen(false)} title="Por que você denuncia?">
        {reportReasons.map((reason) => (
          <ListItem
            key={reason}
            title={reason}
            icon="flag"
            showChevron
            onPress={() => {
              if (!person || !token) {
                setReportOpen(false);
                setNote('Entre na sua conta para denunciar.');
                return;
              }
              void api('/reports', {
                method: 'POST',
                token,
                body: { targetType: 'user', targetId: person.id, reason },
              })
                .then(() => {
                  setReportOpen(false);
                  setNote('Denúncia enviada. A equipe analisa antes de ocultar.');
                })
                .catch((error: unknown) => {
                  setReportOpen(false);
                  setNote(messageFrom(error));
                });
            }}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg },
  headText: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  stats: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  note: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1 },
  cellFill: { flex: 1 },
  image: { width: '100%', height: '100%' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
