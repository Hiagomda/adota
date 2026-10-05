import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadFeed } from '../../src/api';
import { MapCanvas } from '../../src/map/MapCanvas';
import { useSession } from '../../src/session';
import { statusLabel, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';

export default function ExploreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const feed = useQuery({ queryKey: ['map', token], queryFn: () => loadFeed(token, '?limit=30') });
  const [selected, setSelected] = useState<Post | null>(null);
  const posts = feed.data?.posts ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <MapCanvas posts={posts} selectedId={selected?.id ?? null} onSelect={setSelected} />
      {selected ? (
        <SafeAreaView edges={['bottom']} style={[styles.card, { backgroundColor: theme.surface }]}>
          <Pressable onPress={() => router.push(`/post/${selected.id}`)} style={styles.row}>
            {selected.media[0] ? (
              <Image source={{ uri: selected.media[0].thumbUrl }} style={styles.photo} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{selected.approxLabel}</Text>
              <Text style={{ color: theme.muted }} numberOfLines={2}>
                {selected.description}
              </Text>
              <Text style={{ color: theme.accent }}>{statusLabel[selected.status]}</Text>
            </View>
          </Pressable>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 12, right: 12, bottom: 72, borderRadius: 16, padding: 12 },
  row: { flexDirection: 'row', gap: 12 },
  photo: { width: 72, height: 90, borderRadius: 12 },
});
