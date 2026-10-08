import {
  Camera,
  CircleLayer,
  FillLayer,
  Images,
  LineLayer,
  Logger,
  MapView,
  ShapeSource,
  SymbolLayer,
  requestAndroidLocationPermissions,
  UserLocation,
  type OnPressEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Platform } from 'react-native';
import type { Post } from '../types';
import { belem, mapStyleUrl, type MapBounds } from './geo';
import { insideServiceArea, serviceCamera, serviceMask, serviceOutline } from './serviceArea';
import { palette } from '../theme';

const pawImages = {
  pawHigh: require('../../assets/paw-high.png') as number,
  pawMedium: require('../../assets/paw-medium.png') as number,
  pawLow: require('../../assets/paw-low.png') as number,
};

// Tile cancels are normal while the camera moves. Logging each one freezes the JS thread.
Logger.setLogCallback((log) => {
  const canceled =
    log.tag === 'Mbgl-HttpRequest' && log.message.includes('Canceled');
  return (
    canceled || log.level === 'info' || log.level === 'debug' || log.level === 'verbose'
  );
});

export function MapCanvas({
  posts,
  selectedId,
  tracking,
  onSelect,
  onBounds,
}: {
  posts: Post[];
  selectedId: string | null;
  tracking: boolean;
  onSelect: (post: Post) => void;
  onBounds?: (bounds: MapBounds) => void;
}) {
  const [center, setCenter] = useState<[number, number]>(belem);
  const [gpsReady, setGpsReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function readGps() {
      if (Platform.OS === 'android') await requestAndroidLocationPermissions();
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active || permission.status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!active) return;
      const next = {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
      };
      if (!insideServiceArea(next)) return;
      setCenter([next.longitude, next.latitude]);
      setGpsReady(true);
    }
    void readGps();
    return () => {
      active = false;
    };
  }, []);

  const shape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: posts.map((post) => ({
        type: 'Feature' as const,
        id: post.id,
        properties: {
          id: post.id,
          urgency: post.urgency,
          selected: post.id === selectedId,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [post.location.longitude, post.location.latitude],
        },
      })),
    }),
    [posts, selectedId],
  );

  const onRegionDidChange = useCallback<
    NonNullable<ComponentProps<typeof MapView>['onRegionDidChange']>
  >(
    (event) => {
      if (!tracking) return;
      const [northEast, southWest] = event.properties.visibleBounds;
      const east = northEast?.[0];
      const north = northEast?.[1];
      const west = southWest?.[0];
      const south = southWest?.[1];
      if (
        west === undefined ||
        south === undefined ||
        east === undefined ||
        north === undefined
      ) {
        return;
      }
      onBounds?.({ west, south, east, north });
    },
    [onBounds, tracking],
  );

  const onPinPress = useCallback(
    (event: OnPressEvent) => {
      const id = event.features[0]?.properties?.id;
      if (typeof id !== 'string') return;
      const post = posts.find((item) => item.id === id);
      if (post) onSelect(post);
    },
    [onSelect, posts],
  );

  return (
    <MapView
      style={{ flex: 1 }}
      mapStyle={mapStyleUrl}
      attributionEnabled={false}
      onRegionDidChange={onRegionDidChange}
    >
      <Camera
        centerCoordinate={center}
        zoomLevel={gpsReady ? 14 : 12}
        minZoomLevel={8.5}
        maxBounds={{
          ne: [serviceCamera.east, serviceCamera.north],
          sw: [serviceCamera.west, serviceCamera.south],
        }}
        animationDuration={600}
      />
      <ShapeSource id="service-mask" shape={serviceMask}>
        <FillLayer
          id="service-mask-fill"
          style={{ fillColor: '#E23B3B', fillOpacity: 0.45 }}
        />
      </ShapeSource>
      <ShapeSource id="service-outline" shape={serviceOutline}>
        <LineLayer
          id="service-outline-line"
          style={{ lineColor: '#1F8F4E', lineWidth: 3, lineJoin: 'round', lineCap: 'round' }}
        />
      </ShapeSource>
      {gpsReady && tracking ? (
        // AnimatedPoint overwrites AnimatedNode._listeners (a Map) with a plain object.
        // RN 0.86 then crashes in callListeners: "undefined is not a function".
        <UserLocation visible animated={false} minDisplacement={25} />
      ) : null}
      <Images images={pawImages} />
      <ShapeSource
        id="alerts"
        shape={shape}
        cluster
        clusterRadius={48}
        clusterMaxZoomLevel={15}
        onPress={onPinPress}
      >
        <CircleLayer
          id="clusters"
          filter={['has', 'point_count']}
          style={{
            circleColor: palette.acai,
            circleRadius: 18,
            circleStrokeWidth: 2,
            circleStrokeColor: palette.areia,
          }}
        />
        <SymbolLayer
          id="cluster-count"
          filter={['has', 'point_count']}
          style={{
            textField: ['get', 'point_count'],
            textSize: 13,
            textColor: palette.areia,
          }}
        />
        <SymbolLayer
          id="pins"
          filter={['!', ['has', 'point_count']]}
          style={{
            iconImage: [
              'match',
              ['get', 'urgency'],
              'high',
              'pawHigh',
              'medium',
              'pawMedium',
              'low',
              'pawLow',
              'pawMedium',
            ],
            iconSize: ['case', ['==', ['get', 'selected'], true], 0.5, 0.4],
            iconAllowOverlap: true,
            iconIgnorePlacement: true,
          }}
        />
      </ShapeSource>
    </MapView>
  );
}
