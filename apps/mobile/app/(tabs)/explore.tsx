import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadFeed, messageFrom } from '../../src/api';
import { formatWhen } from '../../src/format';
import { MapCanvas } from '../../src/map/MapCanvas';
import { Mascot } from '../../src/mascot';
import type { MapBounds } from '../../src/map/geo';
import { useSession } from '../../src/session';
import { palette, statusLabel, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';

const speciesLabel: Record<string, string> = {
  dog: 'Cachorro',
  cat: 'Gato',
  other: 'Outro',
};

function viewChanged(previous: MapBounds, next: MapBounds): boolean {
  const span = Math.max(
    Math.abs(previous.east - previous.west),
    Math.abs(previous.north - previous.south),
    0.0001,
  );
  const slack = span * 0.12;
  return (
    Math.abs(previous.west - next.west) > slack ||
    Math.abs(previous.east - next.east) > slack ||
    Math.abs(previous.north - next.north) > slack ||
    Math.abs(previous.south - next.south) > slack
  );
}

export default function ExploreScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const token = useSession((state) => state.token);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selected, setSelected] = useState<Post | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accepted = useRef<MapBounds | null>(null);
  const search = bounds
    ? `?status=open&limit=100&west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
    : '';
  const feed = useQuery({
    queryKey: ['map', token, search],
    queryFn: () => loadFeed(token, search),
    enabled: bounds !== null,
  });
  const posts = feed.data?.posts ?? [];
  const openPost = useCallback(
    (id: string) => {
      router.push(`/post/${id}`);
    },
    [router],
  );
  const onBounds = useCallback((next: MapBounds) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const previous = accepted.current;
      if (previous && !viewChanged(previous, next)) return;
      accepted.current = next;
      setBounds(next);
    }, 400);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <MapCanvas
        posts={posts}
        selectedId={selected?.id ?? null}
        tracking={focused}
        onSelect={setSelected}
        onBounds={onBounds}
      />
      {!selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Animais perdidos"
          style={[styles.lost, { top: insets.top + 12, backgroundColor: theme.surface }]}
          onPress={() => router.push('/lost')}
        >
          <Text style={{ color: theme.text, fontWeight: '700' }}>Animais perdidos</Text>
        </Pressable>
      ) : null}
      {bounds && !selected && (feed.isError || posts.length === 0) ? (
        <View style={[styles.banner, { top: insets.top + 64, backgroundColor: theme.surface }]}>
          {feed.isFetching ? null : <Mascot pose={feed.isError ? 'sad' : 'search'} size={64} />}
          <Text style={{ color: theme.text, flex: 1 }}>
            {feed.isError
              ? messageFrom(feed.error)
              : feed.isFetching
                ? 'Buscando resgates nesta área...'
                : 'Nenhum resgate aberto nesta área do mapa.'}
          </Text>
        </View>
      ) : null}
      {!selected ? (
        <View
          style={[styles.legend, { bottom: insets.bottom + 16, backgroundColor: theme.surface }]}
          accessibilityLabel="Área verde: Belém e distritos, até Mosqueiro e Benevides. Vermelho: bloqueado."
        >
          <View style={[styles.swatch, { backgroundColor: '#1F8F4E' }]} />
          <Text style={{ color: theme.text, fontSize: 12 }}>Até Mosqueiro e Benevides</Text>
          <View style={[styles.swatch, { backgroundColor: '#E23B3B' }]} />
          <Text style={{ color: theme.text, fontSize: 12 }}>Bloqueado</Text>
        </View>
      ) : null}
      {selected ? (
        <View style={[styles.card, { bottom: insets.bottom + 72, backgroundColor: theme.surface }]}>
          <Pressable onPress={() => openPost(selected.id)} style={styles.row}>
            {selected.media[0] ? (
              <Image source={{ uri: selected.media[0].thumbUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, { backgroundColor: theme.line }]} />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {speciesLabel[selected.animal.species] ?? 'Animal'} · {statusLabel[selected.status] ?? 'Resgate'}
              </Text>
              <Text style={{ color: theme.muted }} numberOfLines={2}>
                {selected.referencePoint || selected.addressText || selected.approxLabel}
              </Text>
              <Text style={{ color: theme.text }}>{formatWhen(selected.createdAt)}</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver resgate"
            style={styles.open}
            onPress={() => openPost(selected.id)}
          >
            <Text style={styles.openText}>Ver resgate</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lost: {
    position: 'absolute',
    left: 16,
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    position: 'absolute',
    left: 16,
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  photo: { width: 72, height: 90, borderRadius: 12 },
  open: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openText: { color: palette.acai, fontWeight: '700' },
});
