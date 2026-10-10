import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadFeed, messageFrom } from '../../src/api';
import { AppText, Button, Card, Icon, StatusPill, Touchable } from '../../src/components/ui';
import { formatWhen } from '../../src/format';
import { MapCanvas } from '../../src/map/MapCanvas';
import { belemBounds, type MapBounds } from '../../src/map/geo';
import { Mascot } from '../../src/mascot';
import { useSession } from '../../src/session';
import { motion, radius, spacing, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';

const speciesLabel: Record<string, string> = {
  dog: 'Cachorro',
  cat: 'Gato',
  other: 'Outro',
};

// Distance between the selected card and the bottom of the map, so the tab bar never covers it.
const CARD_BOTTOM_OFFSET = spacing.giant + spacing.xxl;
const PHOTO_WIDTH = 72;
const PHOTO_HEIGHT = 90;
const BANNER_MASCOT = 64;

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const token = useSession((state) => state.token);
  const [bounds, setBounds] = useState<MapBounds>(belemBounds);
  const [selected, setSelected] = useState<Post | null>(null);
  const search = `?status=open&limit=100&west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`;
  const feed = useQuery({
    queryKey: ['map', token, search],
    queryFn: () => loadFeed(token, search),
  });
  const posts = (feed.data?.posts ?? []).filter((post) => post.type !== 'lost');
  const openPost = useCallback(
    (id: string) => {
      router.push(`/post/${id}`);
    },
    [router],
  );
  const controlsBottom =
    insets.bottom + (selected ? spacing.giant * 4 : spacing.giant + spacing.lg);

  const bannerText = feed.isError
    ? messageFrom(feed.error)
    : feed.isFetching
      ? 'Buscando resgates nesta área...'
      : 'Nenhum resgate aberto nesta área do mapa.';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MapCanvas
        posts={posts}
        selectedId={selected?.id ?? null}
        tracking={focused}
        controlsBottom={controlsBottom}
        onSelect={setSelected}
        onCommitBounds={setBounds}
      />
      {!selected && (feed.isError || posts.length === 0) ? (
        <Card
          padding="md"
          elevation="md"
          style={[styles.banner, { top: insets.top + spacing.giant + spacing.xl }]}
        >
          <View style={styles.bannerRow}>
            {feed.isFetching ? null : (
              <Mascot pose={feed.isError ? 'sad' : 'search'} size={BANNER_MASCOT} />
            )}
            <AppText style={styles.bannerText} accessibilityLiveRegion="polite">
              {bannerText}
            </AppText>
          </View>
        </Card>
      ) : null}
      {selected ? (
        <Card
          padding="md"
          elevation="md"
          style={[styles.card, { bottom: insets.bottom + CARD_BOTTOM_OFFSET }]}
        >
          <View style={styles.cardBody}>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Abrir resgate selecionado"
              pressedScale={0.99}
              onPress={() => openPost(selected.id)}
              style={styles.row}
            >
              {selected.media[0] ? (
                <Image
                  source={{ uri: selected.media[0].thumbUrl }}
                  style={styles.photo}
                  contentFit="cover"
                  transition={motion.base}
                  cachePolicy="memory-disk"
                  accessibilityLabel="Foto do animal"
                />
              ) : (
                <View
                  style={[
                    styles.photo,
                    styles.photoEmpty,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <Icon name="camera" size="lg" color={colors.textDisabled} />
                </View>
              )}
              <View style={styles.info}>
                <View style={styles.pills}>
                  <StatusPill urgency={selected.urgency} />
                  <StatusPill status={selected.status} />
                </View>
                <AppText variant="bodyStrong">
                  {speciesLabel[selected.animal.species] ?? 'Animal'}
                </AppText>
                <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
                  {selected.referencePoint || selected.addressText || selected.approxLabel}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {formatWhen(selected.createdAt)}
                </AppText>
              </View>
            </Touchable>
            <Button
              title="Ver resgate"
              icon="arrow-right"
              iconPosition="right"
              fullWidth
              onPress={() => openPost(selected.id)}
            />
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bannerText: { flex: 1 },
  card: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  cardBody: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  photo: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT, borderRadius: radius.md },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
