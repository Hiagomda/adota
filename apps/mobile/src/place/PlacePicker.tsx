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
import { MIN_MAP_ZOOM } from '../map/cameraPolicy';
import { useCityChoice } from '../map/cityChoice';
import { accuracyPolygon, mapStyleUrl, type MapPoint } from '../map/geo';
import {
  insideServiceArea,
  municipalityBorders,
  serviceCamera,
  serviceMask,
  serviceOutline,
} from '../map/serviceArea';
import { mapColors, serviceLimit } from '../map/layerColors';
import { radius, useTheme } from '../theme';
import type { Urgency } from '../map/paw';
import { PawPin } from './PawPin';

export function PlacePicker({
  focus,
  accuracyM,
  urgency,
  onChange,
  onOutside,
  jumpTo,
}: {
  focus: MapPoint | null;
  /** Leva o mapa até um ponto (a sede da cidade escolhida na lista). Um movimento por `token`. */
  jumpTo?: { token: number; point: MapPoint; zoom: number } | null;
  accuracyM: number | null;
  urgency: Urgency;
  onChange: (point: MapPoint, fromUser: boolean) => void;
  onOutside?: () => void;
}) {
  const camera = useRef<CameraRef>(null);
  // Sem GPS, o mapa abre na cidade que a pessoa escolheu no mapa principal (Belém por padrão).
  const [startCity] = useState(() => useCityChoice.getState().city);
  const lastInside = useRef<MapPoint>(startCity.seat);
  const snapping = useRef(false);
  const { colors } = useTheme();
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

  const jumped = useRef<number | null>(null);
  useEffect(() => {
    if (!jumpTo || jumped.current === jumpTo.token) return;
    jumped.current = jumpTo.token;
    lastInside.current = jumpTo.point;
    camera.current?.setCamera({
      centerCoordinate: [jumpTo.point.longitude, jumpTo.point.latitude],
      zoomLevel: jumpTo.zoom,
      animationDuration: 600,
    });
  }, [jumpTo]);

  const circle = useMemo(
    () => (focus && accuracyM && accuracyM > 0 ? accuracyPolygon(focus, accuracyM) : null),
    [accuracyM, focus],
  );

  return (
    <View
      onLayout={(event) => {
        const next = Math.max(
          210,
          Math.min(260, Math.round(event.nativeEvent.layout.width * 0.68)),
        );
        setMapHeight((current) => (current === next ? current : next));
      }}
      style={[styles.frame, { height: mapHeight, backgroundColor: colors.surfaceMuted }]}
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
          minZoomLevel={MIN_MAP_ZOOM}
          maxBounds={{
            ne: [serviceCamera.east, serviceCamera.north],
            sw: [serviceCamera.west, serviceCamera.south],
          }}
          defaultSettings={{
            centerCoordinate: [startCity.seat.longitude, startCity.seat.latitude],
            zoomLevel: 15,
          }}
        />
        <ShapeSource id="municipality-borders" shape={municipalityBorders}>
          <LineLayer
            id="municipality-borders-line"
            style={{
              lineColor: mapColors.areaOutline,
              lineWidth: 1,
              lineOpacity: 0.45,
              lineDasharray: [3, 2],
            }}
          />
        </ShapeSource>
        <ShapeSource id="service-mask" shape={serviceMask}>
          <FillLayer
            id="service-mask-fill"
            style={{ fillColor: mapColors.outsideArea, fillOpacity: serviceLimit.maskOpacity }}
          />
        </ShapeSource>
        <ShapeSource id="service-outline" shape={serviceOutline}>
          <LineLayer
            id="service-outline-line"
            style={{
              lineColor: mapColors.areaOutline,
              lineWidth: serviceLimit.lineWidth,
              lineOpacity: serviceLimit.lineOpacity,
              lineJoin: 'round',
              lineCap: 'round',
            }}
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
  frame: { borderRadius: radius.lg, overflow: 'hidden' },
  map: { flex: 1 },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
});
