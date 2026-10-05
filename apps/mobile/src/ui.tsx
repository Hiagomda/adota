import { Image } from 'expo-image';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, urgencyLabel, useTheme } from './theme';
import type { Post } from './types';

export function Avatar({
  name,
  uri,
  urgent,
}: {
  name: string;
  uri?: string | null;
  urgent?: boolean;
}) {
  return (
    <View style={[styles.avatarRing, urgent ? styles.urgentRing : null]}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatar} />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
    </View>
  );
}

export function Chip({ label, tone }: { label: string; tone?: 'high' | 'medium' | 'low' }) {
  const background =
    tone === 'high'
      ? palette.high
      : tone === 'medium'
        ? palette.medium
        : tone === 'low'
          ? palette.low
          : palette.accent;
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <Text style={[styles.chipText, tone === 'medium' ? styles.chipDark : null]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.muted }]}>{body}</Text>
    </View>
  );
}

export function SkeletonCard() {
  const theme = useTheme();
  return <View style={[styles.skeleton, { backgroundColor: theme.surface }]} />;
}

export function PostCard({
  post,
  onOpen,
  onLike,
}: {
  post: Post;
  onOpen: () => void;
  onLike: () => void;
}) {
  const theme = useTheme();
  const photo = post.media[0]?.url;
  const lastTap = useRef(0);
  function onPhoto() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      onLike();
      return;
    }
    lastTap.current = now;
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.background }]}>
      <Pressable onPress={onOpen} style={styles.cardHead}>
        <Avatar
          name={post.author.name}
          uri={post.author.avatarUrl}
          urgent={post.urgency === 'high'}
        />
        <View style={styles.cardHeadText}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>
            {post.author.name}
            {post.author.verified ? ' · verificado' : ''}
          </Text>
          <Text style={{ color: theme.muted }}>{post.approxLabel}</Text>
        </View>
        <Chip label={urgencyLabel[post.urgency] ?? 'Alerta'} tone={post.urgency} />
      </Pressable>
      <Pressable onPress={onPhoto}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
        ) : (
          <View style={styles.photo} />
        )}
      </Pressable>
      <Text style={[styles.description, { color: theme.text }]} numberOfLines={3}>
        {post.description}
      </Text>
      <Text style={{ color: theme.muted, paddingHorizontal: 16, paddingBottom: 16 }}>
        {post.counts.likes} curtidas · {post.counts.comments} comentários
        {post.liked ? ' · você curtiu' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRing: { padding: 2, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
  urgentRing: { borderColor: palette.high },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '700' },
  chip: { minHeight: 28, borderRadius: 999, paddingHorizontal: 10, justifyContent: 'center' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chipDark: { color: '#1a1a1a' },
  empty: { padding: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyBody: { fontSize: 16, lineHeight: 22 },
  skeleton: { height: 420, margin: 16, borderRadius: 16 },
  card: { marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  cardHeadText: { flex: 1 },
  photo: { width: '100%', aspectRatio: 4 / 5, backgroundColor: '#222' },
  description: { paddingHorizontal: 16, paddingTop: 12, fontSize: 16, lineHeight: 22 },
});
