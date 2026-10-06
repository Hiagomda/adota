import {
  Camera,
  MapView,
  MarkerView,
  requestAndroidLocationPermissions,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { Post } from '../types';

const belem: [number, number] = [-48.49, -1.45];

export function MapCanvas({
  posts,
  selectedId,
  onSelect,
}: {
  posts: Post[];
  selectedId: string | null;
  onSelect: (post: Post) => void;
}) {
  const [center, setCenter] = useState<[number, number]>(belem);
  const [zoom, setZoom] = useState(11);
  const [gpsReady, setGpsReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function readGps() {
      if (Platform.OS === 'android') await requestAndroidLocationPermissions();
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!active || permission.status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!active) return;
      setCenter([position.coords.longitude, position.coords.latitude]);
      setZoom(14);
      setGpsReady(true);
    }
    void readGps();
    return () => {
      active = false;
    };
  }, []);

  return (
    <MapView style={styles.map} mapStyle="https://tiles.openfreemap.org/styles/liberty">
      <Camera
        centerCoordinate={center}
        zoomLevel={zoom}
        followUserLocation={gpsReady}
        followZoomLevel={14}
        animationMode="easeTo"
        animationDuration={600}
      />
      {gpsReady ? <UserLocation visible /> : null}
      {posts.map((post) => (
        <MarkerView
          key={post.id}
          coordinate={[post.location.longitude, post.location.latitude]}
          allowOverlap
        >
          <Pressable onPress={() => onSelect(post)}>
            <View
              style={[
                styles.pin,
                {
                  backgroundColor: post.urgency === 'high' ? '#E23B3B' : '#FF6B3D',
                  transform: [{ scale: post.id === selectedId ? 1.4 : 1 }],
                },
              ]}
            />
          </Pressable>
        </MarkerView>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  pin: { width: 18, height: 18, borderRadius: 9 },
});
