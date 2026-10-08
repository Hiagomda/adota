import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../../src/api';
import { useSession } from '../../src/session';
import { screenColumn, useTheme } from '../../src/theme';
import { EmptyState, SkeletonRows } from '../../src/ui';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const logout = useSession((state) => state.logout);
  const [tab, setTab] = useState<'posts' | 'saved' | 'adopted'>('posts');
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () =>
      api<{ id: string; name: string; handle: string; verified: boolean }>('/me', { token }),
    enabled: Boolean(token),
  });
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={Boolean(token) && (me.isRefetching || posts.isRefetching)}
            onRefresh={() => {
              void me.refetch();
              void posts.refetch();
            }}
            tintColor={theme.text}
          />
        }
      >
        <View style={styles.column}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]}>{me.data?.name ?? 'Sua conta'}</Text>
            <Text style={{ color: theme.muted }}>@{me.data?.handle}</Text>
          </View>
          <Pressable style={styles.settings} onPress={() => router.push('/settings')}>
            <Text style={{ color: theme.text }}>Ajustes</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.highlights}
        >
          {(posts.data?.posts ?? [])
            .filter((post) => post.urgency === 'high')
            .slice(0, 6)
            .map((post) => (
              <Pressable key={post.id} onPress={() => router.push(`/story/${post.id}`)}>
                {post.media[0] ? (
                  <Image source={{ uri: post.media[0].thumbUrl }} style={styles.highlight} />
                ) : null}
              </Pressable>
            ))}
        </ScrollView>
        <View style={styles.tabs}>
          {(['posts', 'saved', 'adopted'] as const).map((item) => (
            <Pressable key={item} style={styles.tab} onPress={() => setTab(item)}>
              <Text style={{ color: tab === item ? theme.text : theme.muted, fontWeight: '700' }}>
                {item === 'posts' ? 'Publicações' : item === 'saved' ? 'Salvos' : 'Adotados'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.grid}>
          {(posts.data?.posts ?? []).map((post) => (
            <Pressable
              key={post.id}
              style={styles.cell}
              onPress={() => router.push(`/post/${post.id}`)}
            >
              {post.media[0] ? (
                <Image source={{ uri: post.media[0].thumbUrl }} style={styles.cellImage} />
              ) : null}
            </Pressable>
          ))}
        </View>
        {!token ? (
          <EmptyState
            title="Entre para ver seu perfil"
            body="Seus resgates, os que você salvou e as adoções concluídas ficam ligados à sua conta."
          />
        ) : me.isLoading || posts.isLoading ? (
          <SkeletonRows />
        ) : me.isError || posts.isError ? (
          <EmptyState
            title="Não consegui abrir seu perfil"
            body={messageFrom(me.error ?? posts.error)}
            actionLabel="Tentar de novo"
            onAction={() => {
              void me.refetch();
              void posts.refetch();
            }}
          />
        ) : (posts.data?.posts.length ?? 0) === 0 ? (
          <EmptyState
            title={
              tab === 'posts' ? 'Você ainda não publicou' : tab === 'saved' ? 'Nada salvo' : 'Nenhuma adoção por aqui'
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
          <Pressable
            style={styles.logout}
            onPress={() => {
              void logout().then(() => router.replace('/'));
            }}
          >
            <Text style={{ color: theme.muted }}>Sair</Text>
          </Pressable>
        ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  column: screenColumn,
  head: { flexDirection: 'row', padding: 16, alignItems: 'center', gap: 12 },
  settings: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  name: { fontSize: 24, fontWeight: '700' },
  highlights: { paddingHorizontal: 16, gap: 12 },
  highlight: { width: 68, height: 68, borderRadius: 34 },
  tabs: { flexDirection: 'row', paddingVertical: 8 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1, padding: 1 },
  cellImage: { width: '100%', height: '100%' },
  logout: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
