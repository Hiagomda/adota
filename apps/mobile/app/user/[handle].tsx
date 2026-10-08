import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../../src/api';
import { useSession } from '../../src/session';
import { palette, useTheme } from '../../src/theme';
import { EmptyState, SkeletonRows } from '../../src/ui';

interface Profile {
  id: string;
  name: string;
  handle: string;
  verified: boolean;
  role: string;
  counts: { posts: number; helped: number; followers: number; following: number };
  following: boolean;
}

export default function UserScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const theme = useTheme();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching || posts.isRefetching}
            onRefresh={() => {
              void profile.refetch();
              void posts.refetch();
            }}
            tintColor={theme.text}
          />
        }
      >
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: theme.text }}>Voltar</Text>
        </Pressable>
        {profile.isLoading ? (
          <SkeletonRows />
        ) : profile.isError || !person ? (
          <EmptyState
            title="Não encontrei essa pessoa"
            body={messageFrom(profile.error)}
            actionLabel="Tentar de novo"
            onAction={() => void profile.refetch()}
          />
        ) : (
          <>
            <Text style={[styles.name, { color: theme.text }]}>
              {person.name}
              {person.verified ? ' · verificado' : ''}
            </Text>
            <Text style={{ color: theme.muted, paddingHorizontal: 16 }}>
              @{person.handle} · {person.counts.posts === 1 ? '1 publicação' : `${person.counts.posts} publicações`}{' '}
              · {person.counts.followers} seguidores · {person.counts.helped} resgates
            </Text>
            <View style={styles.actions}>
              <Pressable style={styles.follow} onPress={() => void toggleFollow()}>
                <Text style={{ color: palette.acai, fontWeight: '700' }}>
                  {person.following ? 'Seguindo' : 'Seguir'}
                </Text>
              </Pressable>
              <Pressable style={styles.quiet} onPress={() => setReportOpen(true)}>
                <Text style={{ color: theme.muted }}>Denunciar</Text>
              </Pressable>
              <Pressable style={styles.quiet} onPress={() => void block()}>
                <Text style={{ color: theme.muted }}>Bloquear</Text>
              </Pressable>
            </View>
            {note ? <Text style={[styles.note, { color: theme.muted }]}>{note}</Text> : null}
            <View style={styles.grid}>
              {(posts.data?.posts ?? []).map((post) => (
                <Pressable
                  key={post.id}
                  style={styles.cell}
                  onPress={() => router.push(`/post/${post.id}`)}
                >
                  {post.media[0] ? (
                    <Image source={{ uri: post.media[0].thumbUrl }} style={styles.image} />
                  ) : null}
                </Pressable>
              ))}
            </View>
            {(posts.data?.posts.length ?? 0) === 0 && !posts.isLoading ? (
              <EmptyState title="Nenhum resgate neste perfil" body="Quando esta pessoa publicar, as fotos aparecem aqui." />
            ) : null}
          </>
        )}
      </ScrollView>
      <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={() => setReportOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setReportOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={() => undefined}
          >
            <Text style={{ color: theme.text, fontWeight: '700' }}>Por que você denuncia?</Text>
            {['Conteúdo abusivo', 'Parece venda de animal', 'Informação falsa', 'É spam'].map((reason) => (
              <Pressable
                key={reason}
                style={styles.quiet}
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
              >
                <Text style={{ color: theme.text }}>{reason}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  name: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  follow: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quiet: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  note: { paddingHorizontal: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 4,
  },
});
