import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadFeed, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Card,
  Icon,
  IconButton,
  StatusPill,
  Touchable,
} from '../../src/components/ui';
import { distanceLabel, formatWhen } from '../../src/format';
import { useViewerLocation } from '../../src/place/deviceLocation';
import { useMapAim } from '../../src/map/focusRequest';
import { MapCanvas } from '../../src/map/MapCanvas';
import { belemBounds, boundsAround, cameraFramesPoint, type MapBounds } from '../../src/map/geo';
import { Mascot } from '../../src/mascot';
import { useSession } from '../../src/session';
import { motion, radius, spacing, useTheme } from '../../src/theme';

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

/** Animals still out in the city. Adopted and finished rescues leave the map. */
const ON_MAP = new Set(['open', 'on_the_way', 'for_adoption']);

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const token = useSession((state) => state.token);
  const here = useViewerLocation();
  const aim = useMapAim();
  // Whatever the map shows once it settles, from the app or from the person's gesture, loads by itself.
  const [bounds, setBounds] = useState<MapBounds>(belemBounds);
  const [framedToken, setFramedToken] = useState<number | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const closedAim = useRef<number | null>(null);
  const ignoreSelectUntil = useRef(0);
  const lastPin = useRef({ id: '', at: 0 });
  const aiming = aim !== null && aim.token !== framedToken;
  const view = aiming ? boundsAround({ latitude: aim.latitude, longitude: aim.longitude }) : bounds;
  const focusPoint = useMemo(
    () => (aiming && aim ? ([aim.longitude, aim.latitude] as [number, number]) : null),
    [aim, aiming],
  );
  const search = `?limit=100&west=${view.west}&south=${view.south}&east=${view.east}&north=${view.north}`;
  const feed = useQuery({
    queryKey: ['map', token, search],
    queryFn: () => loadFeed(token, search),
    placeholderData: keepPreviousData,
  });
  const refetchMap = feed.refetch;
  useEffect(() => {
    if (!focused) return;
    void refetchMap();
  }, [focused, refetchMap]);
  useEffect(() => {
    if (!aim || closedAim.current === aim.token) return;
    setSelection(aim.postId);
  }, [aim]);
  useEffect(() => {
    if (!focused || !aiming || !aim) return;
    // If the camera never reports the pin, stop holding the feed on that box.
    const timer = setTimeout(() => setFramedToken(aim.token), 5000);
    return () => clearTimeout(timer);
  }, [aim, aiming, focused]);
  const posts = (feed.data?.posts ?? []).filter(
    (post) => post.type !== 'lost' && post.type !== 'help_request' && ON_MAP.has(post.status),
  );
  const selected = posts.find((post) => post.id === selection) ?? null;
  const openPost = useCallback(
    (id: string) => {
      router.push(`/post/${id}`);
    },
    [router],
  );
  const closeCard = useCallback(() => {
    ignoreSelectUntil.current = Date.now() + 500;
    if (aim) closedAim.current = aim.token;
    setSelection(null);
  }, [aim]);
  const selectPost = useCallback((post: { id: string }) => {
    const now = Date.now();
    if (now < ignoreSelectUntil.current) return;
    if (lastPin.current.id === post.id && now - lastPin.current.at < 250) return;
    lastPin.current = { id: post.id, at: now };
    setSelection((current) => (current === post.id ? null : post.id));
  }, []);
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
        selectedId={selection}
        tracking={focused}
        controlsBottom={controlsBottom}
        onSelect={selectPost}
        onDismiss={closeCard}
        onCommitBounds={(next) => {
          if (aiming && aim && !cameraFramesPoint(next, aim)) return;
          if (aim) setFramedToken(aim.token);
          setBounds(next);
        }}
        focus={focusPoint}
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
          {feed.isError && !feed.isFetching ? (
            <Button
              title="Tentar de novo"
              icon="refresh-cw"
              variant="outline"
              onPress={() => void feed.refetch()}
              style={styles.bannerAction}
            />
          ) : null}
        </Card>
      ) : null}
      {selected ? (
        <View
          style={[styles.cardWrap, { bottom: insets.bottom + CARD_BOTTOM_OFFSET }]}
          pointerEvents="box-none"
        >
          <Card padding="md" elevation="md">
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <IconButton icon="x" accessibilityLabel="Fechar" onPress={closeCard} />
              </View>
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
                    {[formatWhen(selected.createdAt), distanceLabel(here, selected.location)]
                      .filter(Boolean)
                      .join(' · ')}
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bannerAction: { marginTop: spacing.md },
  bannerText: { flex: 1 },
  cardWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 30,
    elevation: 24,
  },
  cardHead: { alignItems: 'flex-end' },
  cardBody: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  photo: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT, borderRadius: radius.md },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
