import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { belem, mapStyleUrl, type MapPoint } from '../map/geo';
import { ensureMapCss } from '../map/mapCss';
import { insideServiceArea } from '../map/serviceArea';
import { limitMapToBelem, showServiceLimit } from '../map/serviceOverlay';
import type { Urgency } from '../map/paw';
import { PawPin } from './PawPin';

export function PlacePicker({
  focus,
  accuracyM,
  urgency,
  onChange,
  onOutside,
}: {
  focus: MapPoint | null;
  accuracyM: number | null;
  urgency: Urgency;
  onChange: (point: MapPoint, fromUser: boolean) => void;
  onOutside?: () => void;
}) {
  const host = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onChangeRef = useRef(onChange);
  const onOutsideRef = useRef(onOutside);
  const focusRef = useRef(focus);
  const accuracyRef = useRef(accuracyM);
  const paintCircleRef = useRef<() => void>(() => undefined);
  const dragged = useRef(false);
  const [mapHeight, setMapHeight] = useState(240);

  useEffect(() => {
    onChangeRef.current = onChange;
    onOutsideRef.current = onOutside;
    focusRef.current = focus;
    accuracyRef.current = accuracyM;
    paintCircleRef.current();
  });

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    ensureMapCss();
    const map = new maplibregl.Map({
      container: node,
      style: mapStyleUrl,
      center: belem,
      zoom: 17,
      attributionControl: false,
    });
    limitMapToBelem(map);
    showServiceLimit(map);
    mapRef.current = map;
    const lastInside = { latitude: belem[1], longitude: belem[0] };
    let snapping = false;
    map.on('dragstart', () => {
      dragged.current = true;
    });
    map.on('moveend', () => {
      if (snapping) {
        snapping = false;
        dragged.current = false;
        return;
      }
      const center = map.getCenter();
      const next = { latitude: center.lat, longitude: center.lng };
      if (!insideServiceArea(next)) {
        snapping = true;
        if (dragged.current) onOutsideRef.current?.();
        dragged.current = false;
        map.easeTo({
          center: [lastInside.longitude, lastInside.latitude],
          duration: 300,
        });
        return;
      }
      lastInside.latitude = next.latitude;
      lastInside.longitude = next.longitude;
      onChangeRef.current(next, dragged.current);
      dragged.current = false;
    });
    const circle = document.createElement('div');
    circle.style.position = 'absolute';
    circle.style.borderRadius = '999px';
    circle.style.background = 'rgba(242, 107, 79, 0.2)';
    circle.style.border = '1px solid rgba(242, 107, 79, 0.8)';
    circle.style.pointerEvents = 'none';
    circle.style.display = 'none';
    map.getCanvasContainer().appendChild(circle);
    const paintCircle = () => {
      const current = focusRef.current;
      const radius = accuracyRef.current;
      if (!current || !radius || radius <= 0) {
        circle.style.display = 'none';
        return;
      }
      const center = map.project([current.longitude, current.latitude]);
      const edge = map.project([
        current.longitude + radius / (111_320 * Math.cos((current.latitude * Math.PI) / 180)),
        current.latitude,
      ]);
      const pixels = Math.abs(edge.x - center.x);
      circle.style.display = 'block';
      circle.style.width = `${pixels * 2}px`;
      circle.style.height = `${pixels * 2}px`;
      circle.style.left = `${center.x - pixels}px`;
      circle.style.top = `${center.y - pixels}px`;
    };
    paintCircleRef.current = paintCircle;
    map.on('load', () => map.resize());
    map.on('move', paintCircle);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || !insideServiceArea(focus)) return;
    map.easeTo({ center: [focus.longitude, focus.latitude], zoom: 17, duration: 600 });
  }, [focus]);

  return (
    <View
      onLayout={(event) => {
        const next = Math.max(210, Math.min(260, Math.round(event.nativeEvent.layout.width * 0.68)));
        setMapHeight((current) => (current === next ? current : next));
      }}
      style={[styles.frame, { height: mapHeight }]}
    >
      <View
        ref={(node) => {
          host.current = node as unknown as HTMLElement | null;
        }}
        style={styles.map}
      />
      <View style={styles.pinLayer}>
        <PawPin urgency={urgency} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
});
