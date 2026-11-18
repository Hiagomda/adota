import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { IconButton } from '../components/ui';
import { reportError } from '../crash/reporter';
import { ensureDeviceWatch, readDeviceFix, useViewerLocation } from '../place/deviceLocation';
import { permissionOutcome } from '../permissions';
import { radius, size, spacing, useTheme } from '../theme';
import {
  MAX_MAP_ZOOM,
  PIN_ZOOM,
  initialCameraState,
  reduceCamera,
  type CameraEvent,
  type CameraState,
  type CameraTarget,
  type LngLat,
} from './cameraPolicy';
import { clusterPoints } from './clusters';
import { mapColors } from './layerColors';
import { insideServiceArea } from './serviceArea';
import { categoryLabels, type CommunityEvent } from '../events/agenda';
import type { FeedPoint } from '../feedPoints/feedPoints';
import { partnerPinKind, type Partner } from '../partners/partners';
import type { Post } from '../types';
import { mapStyleUrl, type BoundsOrigin, type MapBounds } from './geo';
import { limitMapToServiceArea, showServiceLimit } from './serviceOverlay';
import { ensureMapCss } from './mapCss';
import { eventPinUri, feedPointPinUri, partnerPinUri, pawUri } from './paw';

/** Mesmo limite do Android: até este zoom as patas próximas viram grupo. */
const CLUSTER_MAX_ZOOM = PIN_ZOOM - 1;
const FRAME_PADDING = { top: 120, bottom: 160, left: 48, right: 48 };

function clusterButton(count: number, onPress: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.setAttribute('aria-label', `${count} animais aqui. Toque para aproximar.`);
  const diameter = count >= 50 ? 56 : count >= 10 ? 44 : 36;
  Object.assign(element.style, {
    width: `${diameter}px`,
    height: `${diameter}px`,
    borderRadius: '999px',
    border: `3px solid ${mapColors.clusterRing}`,
    background: mapColors.cluster,
    color: mapColors.clusterText,
    font: '700 14px Nunito, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(11, 31, 31, 0.3)',
  });
  element.textContent = count > 99 ? '99+' : String(count);
  element.onclick = (event) => {
    event.stopPropagation();
    onPress();
  };
  return element;
}

function pinButton(label: string, uri: string, size: number): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.setAttribute('aria-label', label);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.padding = '0';
  element.style.border = 'none';
  element.style.background = 'transparent';
  element.style.cursor = 'pointer';
  const image = document.createElement('img');
  image.src = uri;
  image.alt = '';
  image.draggable = false;
  image.width = size;
  image.height = size;
  image.style.display = 'block';
  image.style.pointerEvents = 'none';
  element.replaceChildren(image);
  return element;
}

export function MapCanvas({
  posts,
  partners = [],
  onSelectPartner,
  feedPoints = [],
  onSelectFeedPoint,
  events = [],
  onSelectEvent,
  selectedId,
  tracking,
  controlsBottom = spacing.giant,
  onSelect,
  onDismiss,
  onCommitBounds,
  focus,
  start,
  frame,
  onHome,
  cityName,
}: {
  posts: Post[];
  partners?: Partner[];
  onSelectPartner?: (partner: Partner) => void;
  feedPoints?: FeedPoint[];
  onSelectFeedPoint?: (point: FeedPoint) => void;
  events?: CommunityEvent[];
  onSelectEvent?: (event: CommunityEvent) => void;
  selectedId: string | null;
  tracking: boolean;
  /** Espaço da barra de abas, ou do card aberto, para o botão "Minha localização". */
  controlsBottom?: number;
  onSelect: (post: Post) => void;
  onDismiss?: () => void;
  onCommitBounds?: (bounds: MapBounds, origin: BoundsOrigin) => void;
  focus?: [number, number] | null;
  start: { center: LngLat; zoom: number };
  frame?: { token: number; target: CameraTarget } | null;
  onHome?: () => void;
  cityName: string;
}) {
  const startRef = useRef(start);
  const host = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const postsRef = useRef(posts);
  const partnersRef = useRef(partners);
  const onSelectPartnerRef = useRef(onSelectPartner);
  const feedPointsRef = useRef(feedPoints);
  const onSelectFeedPointRef = useRef(onSelectFeedPoint);
  const eventsRef = useRef(events);
  const onSelectEventRef = useRef(onSelectEvent);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onDismissRef = useRef(onDismiss);
  const onBoundsRef = useRef(onCommitBounds);
  const trackingRef = useRef(tracking);
  const { colors, shadows } = useTheme();
  const policy = useRef<CameraState>(initialCameraState);
  const userMarker = useRef<Marker | null>(null);
  const [gpsReady, setGpsReady] = useState(false);
  const here = useViewerLocation();

  /** A mesma regra de câmera do app Android: centraliza na pessoa uma vez, depois é dela. */
  const apply = useCallback((event: CameraEvent) => {
    const step = reduceCamera(policy.current, event);
    policy.current = step.state;
    const move = step.move;
    if (!move) return;
    if ('bounds' in move) {
      mapRef.current?.fitBounds(
        [
          [move.bounds.west, move.bounds.south],
          [move.bounds.east, move.bounds.north],
        ],
        { padding: FRAME_PADDING, duration: 600, maxZoom: PIN_ZOOM },
      );
      return;
    }
    mapRef.current?.easeTo({ center: move.center, zoom: move.zoom, duration: 600 });
  }, []);

  useEffect(() => {
    postsRef.current = posts;
    partnersRef.current = partners;
    onSelectPartnerRef.current = onSelectPartner;
    feedPointsRef.current = feedPoints;
    onSelectFeedPointRef.current = onSelectFeedPoint;
    eventsRef.current = events;
    onSelectEventRef.current = onSelectEvent;
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
    onDismissRef.current = onDismiss;
    onBoundsRef.current = onCommitBounds;
    trackingRef.current = tracking;
  });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    ensureMapCss();
    const map = new maplibregl.Map({
      container: node,
      style: mapStyleUrl,
      center: startRef.current.center,
      zoom: startRef.current.zoom,
      maxZoom: MAX_MAP_ZOOM,
      attributionControl: false,
    });
    limitMapToServiceArea(map);
    showServiceLimit(map);
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const reportBounds = (fromUser: boolean) => {
      if (!trackingRef.current) return;
      const bounds = map.getBounds();
      onBoundsRef.current?.(
        {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        { fromUser },
      );
    };
    // O evento `load` não dispara se algum ícone do estilo falha.
    // `isStyleLoaded` basta para projetar o pino na tela.
    let drawLater = false;
    const draw = () => {
      // Patas que chegam enquanto o estilo ainda carrega (ou recebe as camadas da área) eram
      // descartadas e só apareciam depois do primeiro arrasto. Agora esperam o mapa assentar.
      if (!map.isStyleLoaded()) {
        if (!drawLater) {
          drawLater = true;
          map.once('idle', () => {
            drawLater = false;
            draw();
          });
        }
        return;
      }
      markers.current.forEach((marker) => marker.remove());
      // Pontos solidários, parceiros e eventos primeiro, para as patas ficarem por cima.
      const feedMarkers = feedPointsRef.current.map((point) => {
        const element = pinButton(point.kindLabel, feedPointPinUri(point.kind), 44);
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectFeedPointRef.current?.(point);
        };
        return new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([point.location.longitude, point.location.latitude])
          .addTo(map);
      });
      const partnerMarkers = partnersRef.current.map((partner) => {
        const element = pinButton(partner.name, partnerPinUri(partnerPinKind(partner.kind)), 52);
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectPartnerRef.current?.(partner);
        };
        return new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([partner.location.longitude, partner.location.latitude])
          .addTo(map);
      });
      const eventMarkers = eventsRef.current.map((item) => {
        const element = pinButton(
          `${categoryLabels[item.category]}: ${item.title}`,
          eventPinUri(item.category),
          52,
        );
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectEventRef.current?.(item);
        };
        return new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([item.location.longitude, item.location.latitude])
          .addTo(map);
      });
      const byId = new Map(postsRef.current.map((post) => [post.id, post]));
      const grouped = clusterPoints(
        postsRef.current.map((post) => ({
          id: post.id,
          latitude: post.location.latitude,
          longitude: post.location.longitude,
        })),
        map.getZoom(),
        { maxZoom: CLUSTER_MAX_ZOOM, keepSingle: selectedRef.current },
      );
      const postMarkers = grouped.flatMap((entry) => {
        if (entry.kind === 'group') {
          // Toque no grupo: enquadra os animais dele, o que já solta o grupo.
          const element = clusterButton(entry.count, () => {
            apply({ type: 'gesture' });
            map.fitBounds(
              [
                [entry.bounds.west, entry.bounds.south],
                [entry.bounds.east, entry.bounds.north],
              ],
              {
                padding: FRAME_PADDING,
                duration: 500,
                maxZoom: PIN_ZOOM,
                minZoom: Math.min(map.getZoom() + 2, PIN_ZOOM),
              },
            );
          });
          return [
            new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([entry.longitude, entry.latitude])
              .addTo(map),
          ];
        }
        const post = byId.get(entry.item.id);
        if (!post) return [];
        const selected = post.id === selectedRef.current;
        const element = pinButton(post.approxLabel, pawUri(post.urgency), selected ? 72 : 64);
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectRef.current(post);
        };
        return [
          new maplibregl.Marker({ element, anchor: 'bottom' })
            .setLngLat([post.location.longitude, post.location.latitude])
            .addTo(map),
        ];
      });
      markers.current = [...feedMarkers, ...partnerMarkers, ...eventMarkers, ...postMarkers];
    };

    let started = false;
    const start = () => {
      if (started || !map.isStyleLoaded()) return;
      started = true;
      map.resize();
      draw();
      reportBounds(false);
    };
    if (map.isStyleLoaded()) start();
    map.on('styledata', start);
    map.on('click', () => onDismissRef.current?.());
    // Arrasto, pinça ou roda do mouse: a câmera passa a ser da pessoa.
    const handOver = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) apply({ type: 'gesture' });
    };
    map.on('dragstart', handOver);
    map.on('zoomstart', handOver);
    // Only gestures carry the browser event; our own moves and redraws do not.
    map.on('moveend', (event) => {
      draw();
      reportBounds(Boolean(event.originalEvent));
    });
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      userMarker.current?.remove();
      userMarker.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [apply]);

  // Antes o mapa do navegador nunca pedia a localização: abria sempre em Belém e não mostrava
  // onde a pessoa estava, diferente do Android.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!active) return;
        if (permissionOutcome(permission) !== 'granted') {
          apply({ type: 'gpsUnavailable' });
          return;
        }
        ensureDeviceWatch();
        const found = await readDeviceFix((fix) => {
          if (!active) return;
          setGpsReady(true);
          apply({
            type: 'gps',
            point: [fix.longitude, fix.latitude],
            inside: insideServiceArea(fix),
          });
        });
        if (active && !found) apply({ type: 'gpsUnavailable' });
      } catch (error) {
        if (!active) return;
        reportError(error, { source: 'handled', where: 'map:gps-web' });
        apply({ type: 'gpsUnavailable' });
      }
    })();
    return () => {
      active = false;
    };
  }, [apply]);

  // O ponto azul acompanha a vigia do aparelho (alta precisão no navegador).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !here) return;
    policy.current = { ...policy.current, user: [here.longitude, here.latitude] };
    if (!userMarker.current) {
      const dot = document.createElement('div');
      dot.setAttribute('aria-label', 'Você está aqui');
      dot.style.width = '18px';
      dot.style.height = '18px';
      dot.style.borderRadius = '999px';
      dot.style.background = mapColors.userDot;
      dot.style.border = `3px solid ${mapColors.userDotRing}`;
      dot.style.boxShadow = '0 0 0 6px rgba(42, 100, 174, 0.2)';
      dot.style.boxSizing = 'border-box';
      dot.style.pointerEvents = 'none';
      userMarker.current = new maplibregl.Marker({ element: dot, anchor: 'center' });
    }
    userMarker.current.setLngLat([here.longitude, here.latitude]).addTo(map);
  }, [here]);

  const pinKey = `${selectedId ?? ''}:${posts
    .map(
      (post) =>
        `${post.id}:${post.location.longitude.toFixed(5)}:${post.location.latitude.toFixed(5)}:${post.urgency}`,
    )
    .join('|')}:${partners.map((partner) => `${partner.id}:${partner.kind}`).join('|')}:${feedPoints
    .map((point) => `${point.id}:${point.kind}`)
    .join('|')}:${events.map((item) => `${item.id}:${item.category}`).join('|')}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fire('moveend');
  }, [pinKey]);

  useEffect(() => {
    if (!focus || !tracking) return;
    // Pela regra de câmera: o pino pedido vence o centro do GPS, que chega depois.
    const move = () => apply({ type: 'pin', point: focus });
    move();
    const timers = [600, 1400].map((delay) => setTimeout(move, delay));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [apply, focus, tracking]);

  const styleReadyFrame = useRef<number | null>(null);
  useEffect(() => {
    if (!frame || styleReadyFrame.current === frame.token) return;
    styleReadyFrame.current = frame.token;
    apply({ type: 'frame', target: frame.target });
  }, [apply, frame]);

  return (
    <View style={styles.map}>
      <View
        ref={(node) => {
          host.current = node as unknown as HTMLElement | null;
        }}
        style={styles.map}
      />
      <View pointerEvents="box-none" style={[styles.locate, { bottom: controlsBottom }]}>
        {onHome ? (
          <View style={[styles.locateButton, shadows.md, { backgroundColor: colors.surface }]}>
            <IconButton
              icon="home"
              variant="tonal"
              accessibilityLabel={`Voltar ao início: ${cityName}`}
              onPress={onHome}
            />
          </View>
        ) : null}
        {/* Só aparece depois que a pessoa autorizou e o GPS respondeu. */}
        {gpsReady ? (
          <View style={[styles.locateButton, shadows.md, { backgroundColor: colors.surface }]}>
            <IconButton
              icon="crosshair"
              variant="tonal"
              accessibilityLabel="Minha localização"
              onPress={() => apply({ type: 'locate' })}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden' },
  locate: { position: 'absolute', right: spacing.lg, gap: spacing.sm },
  locateButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
