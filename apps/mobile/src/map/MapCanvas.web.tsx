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
  initialCameraState,
  reduceCamera,
  type CameraEvent,
  type CameraState,
} from './cameraPolicy';
import { mapColors } from './layerColors';
import { insideServiceArea } from './serviceArea';
import { categoryLabels, type CommunityEvent } from '../events/agenda';
import type { FeedPoint } from '../feedPoints/feedPoints';
import { partnerPinKind, type Partner } from '../partners/partners';
import type { Post } from '../types';
import { approxAreas, belem, mapStyleUrl, type BoundsOrigin, type MapBounds } from './geo';
import { limitMapToBelem, showServiceLimit } from './serviceOverlay';
import { ensureMapCss } from './mapCss';
import { eventPinUri, feedPointPinUri, partnerPinUri, pawUri } from './paw';

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
}) {
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
    if (step.move) {
      mapRef.current?.easeTo({ center: step.move.center, zoom: step.move.zoom, duration: 600 });
    }
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
      center: belem,
      zoom: 12,
      attributionControl: false,
    });
    limitMapToBelem(map);
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
    const draw = () => {
      if (!map.isStyleLoaded()) return;
      // Local aproximado: círculo claro em volta da pata (ver approxAreas).
      const areas = approxAreas(postsRef.current);
      const areaSource = map.getSource('approx-areas') as maplibregl.GeoJSONSource | undefined;
      if (areaSource) areaSource.setData(areas);
      else {
        map.addSource('approx-areas', { type: 'geojson', data: areas });
        map.addLayer({
          id: 'approx-areas-fill',
          type: 'fill',
          source: 'approx-areas',
          paint: { 'fill-color': mapColors.approxArea, 'fill-opacity': 0.12 },
        });
        map.addLayer({
          id: 'approx-areas-line',
          type: 'line',
          source: 'approx-areas',
          paint: {
            'line-color': mapColors.approxArea,
            'line-width': 1.5,
            'line-opacity': 0.5,
            'line-dasharray': [2, 2],
          },
        });
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
      const postMarkers = postsRef.current.map((post) => {
        const selected = post.id === selectedRef.current;
        const element = pinButton(post.approxLabel, pawUri(post.urgency), selected ? 72 : 64);
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectRef.current(post);
        };
        return new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([post.location.longitude, post.location.latitude])
          .addTo(map);
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
        `${post.id}:${post.location.longitude.toFixed(5)}:${post.location.latitude.toFixed(5)}:${post.urgency}:${post.location.exact ? 1 : 0}`,
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

  return (
    <View style={styles.map}>
      <View
        ref={(node) => {
          host.current = node as unknown as HTMLElement | null;
        }}
        style={styles.map}
      />
      {gpsReady ? (
        <View pointerEvents="box-none" style={[styles.locate, { bottom: controlsBottom }]}>
          <View style={[styles.locateButton, shadows.md, { backgroundColor: colors.surface }]}>
            <IconButton
              icon="crosshair"
              variant="tonal"
              accessibilityLabel="Minha localização"
              onPress={() => apply({ type: 'locate' })}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden' },
  locate: { position: 'absolute', right: spacing.lg },
  locateButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
