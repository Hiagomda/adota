import {
  Camera,
  FillLayer,
  LineLayer,
  MapView,
  ShapeSource,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { accuracyPolygon, belem, mapStyleUrl, type MapPoint } from '../map/geo';
import { insideServiceArea, serviceCamera, serviceOutline } from '../map/serviceArea';
import { mapColors } from '../map/layerColors';
import { radius } from '../theme';
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
  const camera = useRef<CameraRef>(null);
  const lastInside = useRef<MapPoint>({ latitude: belem[1], longitude: belem[0] });
  const snapping = useRef(false);
  const [mapHeight, setMapHeight] = useState(240);

  useEffect(() => {
    if (!focus || !insideServiceArea(focus)) return;
    lastInside.current = focus;
    camera.current?.setCamera({
      centerCoordinate: [focus.longitude, focus.latitude],
      zoomLevel: 17,
      animationDuration: 600,
    });
  }, [focus]);

  const circle = useMemo(
    () => (focus && accuracyM && accuracyM > 0 ? accuracyPolygon(focus, accuracyM) : null),
    [accuracyM, focus],
  );

  return (
    <View
      onLayout={(event) => {
        const next = Math.max(210, Math.min(260, Math.round(event.nativeEvent.layout.width * 0.68)));
        setMapHeight((current) => (current === next ? current : next));
      }}
      style={[styles.frame, { height: mapHeight }]}
    >
      <MapView
        style={styles.map}
        mapStyle={mapStyleUrl}
        attributionEnabled={false}
        onRegionDidChange={(event) => {
          const [longitude, latitude] = event.geometry.coordinates;
          if (longitude === undefined || latitude === undefined) return;
          const next = { latitude, longitude };
          if (!insideServiceArea(next)) {
            if (snapping.current) return;
            snapping.current = true;
            if (event.properties.isUserInteraction) onOutside?.();
            camera.current?.setCamera({
              centerCoordinate: [lastInside.current.longitude, lastInside.current.latitude],
              animationDuration: 300,
            });
            return;
          }
          snapping.current = false;
          lastInside.current = next;
          onChange(next, event.properties.isUserInteraction);
        }}
      >
        <Camera
          ref={camera}
          minZoomLevel={8.5}
          maxBounds={{
            ne: [serviceCamera.east, serviceCamera.north],
            sw: [serviceCamera.west, serviceCamera.south],
          }}
          defaultSettings={{ centerCoordinate: belem, zoomLevel: 17 }}
        />
        <ShapeSource id="service-outline" shape={serviceOutline}>
          <LineLayer
            id="service-outline-line"
            style={{ lineColor: mapColors.areaOutline, lineWidth: 3, lineJoin: 'round', lineCap: 'round' }}
          />
        </ShapeSource>
        {circle ? (
          <ShapeSource id="accuracy" shape={circle}>
            <FillLayer
              id="accuracy-fill"
              style={{ fillColor: mapColors.accuracy, fillOpacity: 0.2 }}
            />
          </ShapeSource>
        ) : null}
      </MapView>
      <View style={styles.pinLayer}>
        <PawPin urgency={urgency} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#E7F0EE' },
  map: { flex: 1 },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
});
