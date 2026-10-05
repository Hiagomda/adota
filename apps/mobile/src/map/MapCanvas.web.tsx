import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Post } from '../types';

const bounds = { minLng: -48.56, maxLng: -48.4, minLat: -1.52, maxLat: -1.28 };

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
    <View style={styles.map}>
      <Text style={styles.caption}>Belém</Text>
      {posts.map((post) => {
        const x = (post.location.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng);
        const y = (bounds.maxLat - post.location.latitude) / (bounds.maxLat - bounds.minLat);
        if (x < 0 || x > 1 || y < 0 || y > 1) return null;
        const selected = post.id === selectedId;
        return (
          <Pressable
            key={post.id}
            onPress={() => onSelect(post)}
            style={[
              styles.pin,
              {
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                backgroundColor: post.urgency === 'high' ? '#E23B3B' : '#FF6B3D',
                transform: [{ scale: selected ? 1.4 : 1 }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#16324F', overflow: 'hidden' },
  caption: { position: 'absolute', top: 16, left: 16, color: '#fff', fontWeight: '700' },
  pin: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    marginTop: -9,
  },
});
