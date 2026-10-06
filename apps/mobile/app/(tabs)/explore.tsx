import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadFeed } from '../../src/api';
import { MapCanvas } from '../../src/map/MapCanvas';
import type { MapBounds } from '../../src/map/geo';
import { useSession } from '../../src/session';
import { statusLabel, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';

const speciesLabel: Record<string, string> = {
  dog: 'Cachorro',
  cat: 'Gato',
  other: 'Outro',
};

function formatWhen(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return `há ${days} d`;
}

export default function ExploreScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<Post | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = bounds
    ? `?status=open&limit=100&west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
    : '';
  const feed = useQuery({
    queryKey: ['map', token, search],
    queryFn: () => loadFeed(token, search),
    enabled: bounds !== null,
  });
  const posts = feed.data?.posts ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <MapCanvas
        posts={posts}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        onBounds={(next) => {
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => setBounds(next), 400);
        }}
      />
      {selected ? (
        <View style={[styles.card, { bottom: insets.bottom + 72, backgroundColor: theme.surface }]}>
          <Pressable onPress={() => router.push(`/post/${selected.id}`)} style={styles.row}>
            {selected.media[0] ? (
              <Image source={{ uri: selected.media[0].thumbUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, { backgroundColor: theme.line }]} />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {speciesLabel[selected.animal.species] ?? 'Animal'} · {statusLabel[selected.status]}
              </Text>
              <Text style={{ color: theme.muted }} numberOfLines={2}>
                {selected.referencePoint || selected.addressText || selected.approxLabel}
              </Text>
              <Text style={{ color: theme.text }}>{formatWhen(selected.createdAt)}</Text>
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 12,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 72, height: 90, borderRadius: 12 },
});
