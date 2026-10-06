import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import type { Post } from '../types';
import { belem, mapStyleUrl, type MapBounds } from './geo';
import { ensureMapCss } from './mapCss';
import { pawUri } from './paw';
import { palette } from '../theme';

const clusterRadiusPx = 48;

// O worker de GeoJSON do MapLibre não sobe no Metro, então o agrupamento é feito aqui.

function groupsOf(map: MapLibreMap, posts: Post[]) {
  if (map.getZoom() >= 15) {
    return posts.map((post) => ({
      posts: [post],
      longitude: post.location.longitude,
      latitude: post.location.latitude,
    }));
  }
  const groups: { posts: Post[]; longitude: number; latitude: number }[] = [];
  for (const post of posts) {
    const point = map.project([post.location.longitude, post.location.latitude]);
    const group = groups.find((item) => {
      const origin = map.project([item.longitude, item.latitude]);
      return Math.hypot(origin.x - point.x, origin.y - point.y) < clusterRadiusPx;
    });
    if (!group) {
      groups.push({
        posts: [post],
        longitude: post.location.longitude,
        latitude: post.location.latitude,
      });
      continue;
    }
    group.posts.push(post);
  }
  return groups;
}

export function MapCanvas({
  posts,
  selectedId,
  onSelect,
  onBounds,
}: {
  posts: Post[];
  selectedId: string | null;
  onSelect: (post: Post) => void;
  onBounds?: (bounds: MapBounds) => void;
}) {
  const host = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const postsRef = useRef(posts);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onBoundsRef = useRef(onBounds);

  useEffect(() => {
    postsRef.current = posts;
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
    onBoundsRef.current = onBounds;
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
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    const reportBounds = () => {
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
      markers.current = groupsOf(map, postsRef.current).map((group) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.style.border = `2px solid ${palette.areia}`;
        element.style.padding = '0';
        element.style.cursor = 'pointer';
        element.style.color = palette.areia;
        element.style.fontWeight = '700';
        if (group.posts.length > 1) {
          element.textContent = String(group.posts.length);
          element.style.width = '36px';
          element.style.height = '36px';
          element.style.borderRadius = '18px';
          element.style.background = palette.acai;
          element.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Um toque abre o grupo até o nível da rua, onde os pinos se separam.
            map.jumpTo({
              center: [group.longitude, group.latitude],
              zoom: Math.min(Math.max(map.getZoom() + 2, 16), 18),
            });
          };
        } else {
          const post = group.posts[0];
          if (!post) return new maplibregl.Marker({ element }).setLngLat([0, 0]);
          const selected = post.id === selectedRef.current;
          const size = selected ? 56 : 48;
          element.setAttribute('aria-label', post.approxLabel);
          element.style.width = `${size}px`;
          element.style.height = `${size}px`;
          element.style.border = 'none';
          element.style.background = 'transparent';
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
        }
        return new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([group.longitude, group.latitude])
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
