import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { Post } from '../types';
import { belem, mapStyleUrl, type MapBounds } from './geo';
import { limitMapToBelem, showServiceLimit } from './serviceOverlay';
import { ensureMapCss } from './mapCss';
import { pawUri } from './paw';

export function MapCanvas({
  posts,
  selectedId,
  tracking,
  onSelect,
  onCommitBounds,
}: {
  posts: Post[];
  selectedId: string | null;
  tracking: boolean;
  /** Native map uses this to clear the tab bar. The web preview has no floating locate button. */
  controlsBottom?: number;
  onSelect: (post: Post) => void;
  onCommitBounds?: (bounds: MapBounds) => void;
}) {
  const host = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const postsRef = useRef(posts);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onBoundsRef = useRef(onCommitBounds);
  const trackingRef = useRef(tracking);

  useEffect(() => {
    postsRef.current = posts;
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
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

    const reportBounds = () => {
      if (!trackingRef.current) return;
      const bounds = map.getBounds();
      onBoundsRef.current?.({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
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
        element.onclick = () => onSelectRef.current(post);
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
      reportBounds();
    };
    if (map.isStyleLoaded()) start();
    map.on('styledata', start);
    map.on('moveend', () => {
      draw();
      reportBounds();
    });
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fire('moveend');
  }, [posts, selectedId]);

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
