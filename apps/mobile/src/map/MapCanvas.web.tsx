import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { Partner } from '../partners/partners';
import type { Post } from '../types';
import { belem, mapStyleUrl, type BoundsOrigin, type MapBounds } from './geo';
import { limitMapToBelem, showServiceLimit } from './serviceOverlay';
import { ensureMapCss } from './mapCss';
import { partnerPinUri, pawUri } from './paw';

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
  selectedId,
  tracking,
  onSelect,
  onDismiss,
  onCommitBounds,
  focus,
}: {
  posts: Post[];
  partners?: Partner[];
  onSelectPartner?: (partner: Partner) => void;
  selectedId: string | null;
  tracking: boolean;
  /** Native map uses this to clear the tab bar. The web preview has no floating locate button. */
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
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onDismissRef = useRef(onDismiss);
  const onBoundsRef = useRef(onCommitBounds);
  const trackingRef = useRef(tracking);

  useEffect(() => {
    postsRef.current = posts;
    partnersRef.current = partners;
    onSelectPartnerRef.current = onSelectPartner;
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
      markers.current.forEach((marker) => marker.remove());
      // Parceiros primeiro, para as patas ficarem por cima.
      const partnerMarkers = partnersRef.current.map((partner) => {
        const element = pinButton(partner.name, partnerPinUri(), 52);
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectPartnerRef.current?.(partner);
        };
        return new maplibregl.Marker({ element, anchor: 'bottom' })
          .setLngLat([partner.location.longitude, partner.location.latitude])
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
      markers.current = [...partnerMarkers, ...postMarkers];
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
    // Only gestures carry the browser event; our own moves and redraws do not.
    map.on('moveend', (event) => {
      draw();
      reportBounds(Boolean(event.originalEvent));
    });
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const pinKey = `${selectedId ?? ''}:${posts
    .map(
      (post) =>
        `${post.id}:${post.location.longitude.toFixed(5)}:${post.location.latitude.toFixed(5)}:${post.urgency}`,
    )
    .join('|')}:${partners.map((partner) => partner.id).join('|')}`;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fire('moveend');
  }, [pinKey]);

  useEffect(() => {
    if (!focus || !tracking) return;
    const move = () => mapRef.current?.easeTo({ center: focus, zoom: 15, duration: 600 });
    move();
    const timers = [600, 1400].map((delay) => setTimeout(move, delay));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [focus, tracking]);

  return (
    <View
      ref={(node) => {
        host.current = node as unknown as HTMLElement | null;
      }}
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden' },
});
