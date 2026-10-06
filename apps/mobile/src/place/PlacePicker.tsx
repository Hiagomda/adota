import { Camera, FillLayer, MapView, ShapeSource, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { accuracyPolygon, belem, mapStyleUrl, type MapPoint } from '../map/geo';
import { palette } from '../theme';
import type { Urgency } from '../map/paw';
import { PawPin } from './PawPin';

export function PlacePicker({
  focus,
  accuracyM,
  urgency,
  onChange,
}: {
  focus: MapPoint | null;
  accuracyM: number | null;
  urgency: Urgency;
  onChange: (point: MapPoint, fromUser: boolean) => void;
}) {
  const camera = useRef<CameraRef>(null);
  const [mapHeight, setMapHeight] = useState(240);

  useEffect(() => {
    if (!focus) return;
    camera.current?.setCamera({
      centerCoordinate: [focus.longitude, focus.latitude],
      zoomLevel: 17,
      animationDuration: 600,
    });
  }, [focus]);

  const circle =
    focus && accuracyM && accuracyM > 0 ? accuracyPolygon(focus, accuracyM) : null;

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
        onRegionDidChange={(event) => {
          const [longitude, latitude] = event.geometry.coordinates;
          if (longitude === undefined || latitude === undefined) return;
          onChange({ latitude, longitude }, event.properties.isUserInteraction);
        }}
      >
        <Camera ref={camera} defaultSettings={{ centerCoordinate: belem, zoomLevel: 17 }} />
        {circle ? (
          <ShapeSource id="accuracy" shape={circle}>
            <FillLayer
              id="accuracy-fill"
              style={{ fillColor: palette.caju, fillOpacity: 0.2 }}
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
  frame: { borderRadius: 16, overflow: 'hidden' },
  map: { flex: 1 },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
});
