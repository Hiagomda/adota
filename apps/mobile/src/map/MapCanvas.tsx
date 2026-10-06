import {
  Camera,
  CircleLayer,
  Images,
  MapView,
  ShapeSource,
  SymbolLayer,
  requestAndroidLocationPermissions,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Post } from '../types';
import { belem, mapStyleUrl, type MapBounds } from './geo';
import { palette } from '../theme';

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
      setCenter([position.coords.longitude, position.coords.latitude]);
      setGpsReady(true);
    }
    void readGps();
    return () => {
      active = false;
    };
  }, []);

  const shape = {
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
  };

  return (
    <MapView
      style={{ flex: 1 }}
      mapStyle={mapStyleUrl}
      onRegionDidChange={(event) => {
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
      }}
    >
      <Camera centerCoordinate={center} zoomLevel={gpsReady ? 14 : 12} animationDuration={600} />
      {gpsReady ? <UserLocation visible /> : null}
      <Images
        images={{
          pawHigh: require('../../assets/paw-high.png'),
          pawMedium: require('../../assets/paw-medium.png'),
          pawLow: require('../../assets/paw-low.png'),
        }}
      />
      <ShapeSource
        id="alerts"
        shape={shape}
        cluster
        clusterRadius={48}
        clusterMaxZoomLevel={15}
        onPress={(event) => {
          const feature = event.features[0];
          const id = feature?.properties?.id;
          if (typeof id !== 'string') return;
          const post = posts.find((item) => item.id === id);
          if (post) onSelect(post);
        }}
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
