import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadFeed } from '../../src/api';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme';
import { EmptyState } from '../../src/ui';

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
      <ScrollView>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]}>{me.data?.name ?? 'Sua conta'}</Text>
            <Text style={{ color: theme.muted }}>@{me.data?.handle}</Text>
          </View>
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={{ color: theme.accent }}>Ajustes</Text>
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
            <Pressable key={item} onPress={() => setTab(item)}>
              <Text style={{ color: tab === item ? theme.text : theme.muted, fontWeight: '700' }}>
                {item === 'posts' ? 'Posts' : item === 'saved' ? 'Salvos' : 'Adotados'}
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
        {(posts.data?.posts.length ?? 0) === 0 ? (
          <EmptyState
            title="Nada nesta aba"
            body="Seus alertas, os que você salvou e as adoções concluídas ficam aqui."
          />
        ) : null}
        <Pressable
          style={styles.logout}
          onPress={() => {
            void logout().then(() => router.replace('/login'));
          }}
        >
          <Text style={{ color: theme.muted }}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  name: { fontSize: 24, fontWeight: '700' },
  highlights: { paddingHorizontal: 16, gap: 10 },
  highlight: { width: 64, height: 64, borderRadius: 32 },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1 },
  cellImage: { width: '100%', height: '100%' },
  logout: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
