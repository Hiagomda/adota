import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadFeed } from '../../src/api';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme';

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
  const router = useRouter();
  const token = useSession((state) => state.token);
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: theme.text }}>Voltar</Text>
      </Pressable>
      <Text style={[styles.name, { color: theme.text }]}>
        {person?.name} {person?.verified ? '· verificado' : ''}
      </Text>
      <Text style={{ color: theme.muted, paddingHorizontal: 16 }}>
        @{person?.handle} · {person?.counts.posts ?? 0} posts · {person?.counts.followers ?? 0}{' '}
        seguidores · {person?.counts.helped ?? 0} resgates
      </Text>
      {person ? (
        <Pressable
          style={styles.follow}
          onPress={() =>
            void api(`/users/${person.id}/follow`, {
              method: person.following ? 'DELETE' : 'POST',
              token,
            })
          }
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {person.following ? 'Seguindo' : 'Seguir'}
          </Text>
        </Pressable>
      ) : null}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  name: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16 },
  follow: {
    alignSelf: 'flex-start',
    margin: 16,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FF6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
});
