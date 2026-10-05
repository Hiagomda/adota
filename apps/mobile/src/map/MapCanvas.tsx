import { Camera, MapView, MarkerView } from '@maplibre/maplibre-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Post } from '../types';

export function MapCanvas({
  posts,
  selectedId,
  onSelect,
}: {
  posts: Post[];
  selectedId: string | null;
  onSelect: (post: Post) => void;
}) {
  return (
    <MapView style={styles.map} mapStyle="https://demotiles.maplibre.org/style.json">
      <Camera centerCoordinate={[-48.49, -1.45]} zoomLevel={11} />
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
