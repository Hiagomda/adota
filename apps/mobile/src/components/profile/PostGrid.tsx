import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { motion, useTheme } from '../../theme';
import type { Post } from '../../types';
import { Icon, Touchable } from '../ui';

/** Ícone do canto da miniatura: adotado ou várias fotos. */
function cornerIcon(post: Post) {
  if (post.status === 'adopted') return 'home' as const;
  if (post.media.length > 1) return 'layers' as const;
  return null;
}

/** Grade de 3 colunas no estilo do Instagram, com linhas finas entre as fotos. */
export function PostGrid({ posts }: { posts: Post[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={styles.grid}>
      {posts.map((post) => {
        const corner = cornerIcon(post);
        return (
          <Touchable
            key={post.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir resgate em ${post.approxLabel}`}
            pressedScale={0.97}
            style={styles.cell}
            onPress={() => router.push(`/post/${post.id}`)}
          >
            <View style={[styles.fill, { backgroundColor: colors.surfaceMuted }]}>
              {post.media[0] ? (
                <Image
                  source={{ uri: post.media[0].thumbUrl }}
                  style={styles.image}
                  contentFit="cover"
                  transition={motion.base}
                  cachePolicy="memory-disk"
                  recyclingKey={post.id}
                />
              ) : (
                <View style={styles.empty}>
                  <Icon name="camera" color={colors.textDisabled} />
                </View>
              )}
              {corner ? (
                <View style={styles.corner} pointerEvents="none">
                  <Icon name={corner} size="sm" color={colors.onMedia} />
                </View>
              ) : null}
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // O recuo de 1 px em cada célula desenha as linhas finas entre as fotos.
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1 },
  cell: { width: '33.33%', aspectRatio: 1, padding: 1 },
  fill: { flex: 1 },
  image: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', top: 6, right: 6 },
});
