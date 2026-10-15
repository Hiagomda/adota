import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { Post } from '../types';
import { belem, mapStyleUrl, type BoundsOrigin, type MapBounds } from './geo';
import { limitMapToBelem, showServiceLimit } from './serviceOverlay';
import { ensureMapCss } from './mapCss';
import { pawUri } from './paw';

export function MapCanvas({
  posts,
  selectedId,
  tracking,
  onSelect,
  onDismiss,
  onCommitBounds,
  focus,
}: {
  posts: Post[];
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
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onDismissRef = useRef(onDismiss);
  const onBoundsRef = useRef(onCommitBounds);
  const trackingRef = useRef(tracking);

  useEffect(() => {
    postsRef.current = posts;
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
      markers.current = postsRef.current.map((post) => {
        const selected = post.id === selectedRef.current;
        const size = selected ? 72 : 64;
        const element = document.createElement('button');
        element.type = 'button';
        element.setAttribute('aria-label', post.approxLabel);
        element.style.width = `${size}px`;
        element.style.height = `${size}px`;
        element.style.padding = '0';
        element.style.border = 'none';
        element.style.background = 'transparent';
        element.style.cursor = 'pointer';
        const image = document.createElement('img');
        image.src = pawUri(post.urgency);
        image.alt = '';
        image.draggable = false;
        image.width = size;
        image.height = size;
        image.style.display = 'block';
        image.style.pointerEvents = 'none';
        element.replaceChildren(image);
        element.onclick = (event) => {
          event.stopPropagation();
          onSelectRef.current(post);
        };
        return new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([post.location.longitude, post.location.latitude])
          .addTo(map);
      });
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
    .join('|')}`;
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
