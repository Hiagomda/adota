import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Card,
  Icon,
  IconButton,
  StatusPill,
  Touchable,
} from '../../src/components/ui';
import type { CommunityEvent, EventList } from '../../src/events/agenda';
import { EventMapCard } from '../../src/events/EventMapCard';
import { loadFeedPointsIn } from '../../src/feedPoints/api';
import { FeedPointDetails } from '../../src/feedPoints/FeedPointDetails';
import type { FeedPoint } from '../../src/feedPoints/feedPoints';
import { distanceLabel, formatWhen } from '../../src/format';
import { useViewerLocation } from '../../src/place/deviceLocation';
import { useMapAim } from '../../src/map/focusRequest';
import { mergePaws } from '../../src/map/knownPaws';
import { MapCanvas } from '../../src/map/MapCanvas';
import { MapLayersButton, MapLayersPanel } from '../../src/map/MapLayers';
import { useAppSwitches } from '../../src/appSwitches';
import { belemBounds, boundsAround, cameraFramesPoint, type MapBounds } from '../../src/map/geo';
import { liveEvent } from '../../src/home/highlights';
import { Mascot } from '../../src/mascot';
import { countPartnerTap, loadPartnersIn } from '../../src/partners/api';
import { PartnerDetails } from '../../src/partners/PartnerDetails';
import { PartnerInvite } from '../../src/partners/PartnerInvite';
import type { Partner } from '../../src/partners/partners';
import { useSession } from '../../src/session';
import { motion, radius, spacing, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';

const speciesLabel: Record<string, string> = {
  dog: 'Cachorro',
  cat: 'Gato',
  other: 'Outro',
};

// Distância entre o card selecionado e a base do mapa, para a barra de abas nunca cobri-lo.
const CARD_BOTTOM_OFFSET = spacing.giant + spacing.xxl;
const PHOTO_WIDTH = 72;
const PHOTO_HEIGHT = 90;
const BANNER_MASCOT = 64;

/** Animais ainda na rua. Adotados e resgates encerrados saem do mapa. */
const ON_MAP = new Set(['open', 'on_the_way', 'for_adoption']);

function onMap(post: Post): boolean {
  return post.type !== 'lost' && post.type !== 'help_request' && ON_MAP.has(post.status);
}

export default function ExploreScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const token = useSession((state) => state.token);
  const here = useViewerLocation();
  const aim = useMapAim();
  // O que o mapa mostra quando para, por movimento do app ou gesto da pessoa, carrega sozinho.
  const [bounds, setBounds] = useState<MapBounds>(belemBounds);
  const [framedToken, setFramedToken] = useState<number | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [showPartners, setShowPartners] = useState(true);
  const [partnerSelection, setPartnerSelection] = useState<Partner | null>(null);
  const [showFeedPoints, setShowFeedPoints] = useState(true);
  const [feedPointSelection, setFeedPointSelection] = useState<FeedPoint | null>(null);
  const [showEvents, setShowEvents] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const switches = useAppSwitches();
  const [eventSelection, setEventSelection] = useState<CommunityEvent | null>(null);
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
  const partnersQuery = useQuery({
    queryKey: ['partners', 'map', search],
    queryFn: () => loadPartnersIn(view),
    placeholderData: keepPreviousData,
    enabled: showPartners,
    staleTime: 5 * 60 * 1000,
  });
  const partners = useMemo(
    () => (showPartners ? (partnersQuery.data?.partners ?? []) : []),
    [partnersQuery.data, showPartners],
  );
  const feedPointsQuery = useQuery({
    queryKey: ['feed-points', 'map', search],
    queryFn: () => loadFeedPointsIn(view),
    placeholderData: keepPreviousData,
    enabled: showFeedPoints,
    staleTime: 2 * 60 * 1000,
  });
  const feedPoints = useMemo(
    () => (showFeedPoints ? (feedPointsQuery.data?.points ?? []) : []),
    [feedPointsQuery.data, showFeedPoints],
  );
  // Eventos são poucos na cidade toda: uma lista só, sem depender da área do mapa.
  const eventsQuery = useQuery({
    queryKey: ['events', 'map', token],
    queryFn: () => api<EventList>('/events', { token }),
    enabled: showEvents,
    staleTime: 5 * 60 * 1000,
  });
  const events = useMemo(() => {
    if (!showEvents) return [];
    // A hora da resposta basta: a lista recarrega a cada 5 minutos.
    const at = eventsQuery.dataUpdatedAt;
    return (eventsQuery.data?.events ?? []).filter((event) => liveEvent(event, at));
  }, [eventsQuery.data, eventsQuery.dataUpdatedAt, showEvents]);
  // O cartão aberto acompanha o que o mapa recarregou (depois de "abasteci", por exemplo).
  const shownFeedPoint = feedPointSelection
    ? (feedPoints.find((point) => point.id === feedPointSelection.id) ?? feedPointSelection)
    : null;
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
    // Se a câmera nunca mostrar o pino, para de prender a busca naquela área.
    const timer = setTimeout(() => setFramedToken(aim.token), 5000);
    return () => clearTimeout(timer);
  }, [aim, aiming, focused]);
  const fetched = feed.data?.posts;
  const inView = useMemo(() => (fetched ?? []).filter(onMap), [fetched]);
  // O mapa acumula as patas já carregadas (ver mergePaws). Atualizado durante o render quando
  // chega uma resposta nova, o padrão do React para estado derivado.
  const [paws, setPaws] = useState(() => ({
    from: fetched,
    known: mergePaws(new Map<string, Post>(), fetched ?? [], onMap),
  }));
  if (paws.from !== fetched) {
    setPaws({ from: fetched, known: mergePaws(paws.known, fetched ?? [], onMap) });
  }
  const posts = useMemo(() => [...paws.known.values()], [paws.known]);
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
    setPartnerSelection(null);
    setFeedPointSelection(null);
    setEventSelection(null);
    setLayersOpen(false);
  }, [aim]);
  const selectPartner = useCallback(
    (partner: Partner) => {
      setSelection(null);
      if (partnerSelection?.id === partner.id) {
        setPartnerSelection(null);
        return;
      }
      countPartnerTap(partner.id, 'view', token);
      setFeedPointSelection(null);
      setEventSelection(null);
      setPartnerSelection(partner);
    },
    [partnerSelection, token],
  );
  const selectFeedPoint = useCallback((point: FeedPoint) => {
    setSelection(null);
    setPartnerSelection(null);
    setEventSelection(null);
    setFeedPointSelection((current) => (current?.id === point.id ? null : point));
  }, []);
  const selectPost = useCallback((post: { id: string }) => {
    const now = Date.now();
    if (now < ignoreSelectUntil.current) return;
    if (lastPin.current.id === post.id && now - lastPin.current.at < 250) return;
    lastPin.current = { id: post.id, at: now };
    setPartnerSelection(null);
    setFeedPointSelection(null);
    setEventSelection(null);
    setSelection((current) => (current === post.id ? null : post.id));
  }, []);
  const selectEvent = useCallback((event: CommunityEvent) => {
    setSelection(null);
    setPartnerSelection(null);
    setFeedPointSelection(null);
    setEventSelection((current) => (current?.id === event.id ? null : event));
  }, []);
  const cardOpen =
    selected !== null ||
    partnerSelection !== null ||
    shownFeedPoint !== null ||
    eventSelection !== null;
  const controlsBottom =
    insets.bottom + (cardOpen ? spacing.giant * 4 : spacing.giant + spacing.lg);
  // O botão "Camadas" fica à esquerda, na mesma altura do "Minha localização" (à direita).
  const locateBottom = controlsBottom;

  const bannerText = feed.isError
    ? messageFrom(feed.error)
    : feed.isFetching
      ? 'Buscando resgates nesta área...'
      : 'Nenhum resgate aberto nesta área do mapa.';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <MapCanvas
        posts={posts}
        partners={partners}
        onSelectPartner={selectPartner}
        feedPoints={feedPoints}
        onSelectFeedPoint={selectFeedPoint}
        events={events}
        onSelectEvent={selectEvent}
        selectedId={selection}
        tracking={focused}
        controlsBottom={locateBottom}
        onSelect={selectPost}
        onDismiss={closeCard}
        onCommitBounds={(next) => {
          if (aiming && aim && !cameraFramesPoint(next, aim)) return;
          if (aim) setFramedToken(aim.token);
          setBounds(next);
        }}
        focus={focusPoint}
      />
      {!cardOpen && (feed.isError || inView.length === 0) ? (
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
                    <StatusPill status={selected.status} type={selected.type} />
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
      {partnerSelection ? (
        <View
          style={[styles.cardWrap, { bottom: insets.bottom + CARD_BOTTOM_OFFSET }]}
          pointerEvents="box-none"
        >
          <Card padding="md" elevation="md">
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <IconButton icon="x" accessibilityLabel="Fechar" onPress={closeCard} />
              </View>
              <PartnerDetails partner={partnerSelection} compact />
            </View>
          </Card>
        </View>
      ) : null}
      {shownFeedPoint ? (
        <View
          style={[styles.cardWrap, { bottom: insets.bottom + CARD_BOTTOM_OFFSET }]}
          pointerEvents="box-none"
        >
          <Card padding="md" elevation="md">
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <IconButton icon="x" accessibilityLabel="Fechar" onPress={closeCard} />
              </View>
              <FeedPointDetails
                point={shownFeedPoint}
                compact
                onHidden={() => setFeedPointSelection(null)}
              />
            </View>
          </Card>
        </View>
      ) : null}
      {eventSelection ? (
        <View
          style={[styles.cardWrap, { bottom: insets.bottom + CARD_BOTTOM_OFFSET }]}
          pointerEvents="box-none"
        >
          <Card padding="md" elevation="md">
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <IconButton icon="x" accessibilityLabel="Fechar" onPress={closeCard} />
              </View>
              <EventMapCard
                event={eventSelection}
                onOpen={(event) => router.push(`/evento/${event.id}`)}
              />
            </View>
          </Card>
        </View>
      ) : null}
      {!cardOpen ? (
        <View pointerEvents="box-none" style={[styles.layers, { bottom: controlsBottom }]}>
          {layersOpen ? (
            <MapLayersPanel
              value={{ events: showEvents, feedPoints: showFeedPoints, partners: showPartners }}
              onChange={(next) => {
                setShowEvents(next.events);
                setShowFeedPoints(next.feedPoints);
                setShowPartners(next.partners);
              }}
              onAddFeedPoint={() => {
                setLayersOpen(false);
                router.push('/pontos');
              }}
              onAdvertise={
                switches.partnerInvite
                  ? () => {
                      setLayersOpen(false);
                      router.push('/parceiros');
                    }
                  : undefined
              }
            />
          ) : null}
          <MapLayersButton
            open={layersOpen}
            hidden={[showEvents, showFeedPoints, showPartners].filter((on) => !on).length}
            onPress={() => setLayersOpen((value) => !value)}
          />
        </View>
      ) : null}
      {switches.partnerInvite ? <PartnerInvite active={focused && !cardOpen} /> : null}
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
  // Botão "Camadas" no canto de baixo à esquerda; o painel abre logo acima dele.
  layers: {
    position: 'absolute',
    left: spacing.lg,
    alignItems: 'flex-start',
    gap: spacing.sm,
    zIndex: 20,
  },
  cardBody: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  photo: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT, borderRadius: radius.md },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
