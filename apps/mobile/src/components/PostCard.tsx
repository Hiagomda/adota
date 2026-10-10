import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { animalHeadline } from '../animalLabels';
import { formatWhen } from '../format';
import {
  motion,
  radius,
  spacing,
  useMotionDuration,
  useTheme,
} from '../theme';
import type { Post } from '../types';
import { AppText, Avatar, Badge, Button, Icon, PhotoScrim, StatusPill, Touchable } from './ui';

interface PostCardProps {
  post: Post;
  onOpen: (id: string) => void;
  onLike: (post: Post) => void;
}

const DOUBLE_TAP_MS = 280;
const HEART_MS = 650;

export const PostCard = memo(function PostCard({ post, onOpen, onLike }: PostCardProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const photo = post.media[0]?.thumbUrl || post.media[0]?.url;
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heart, setHeart] = useState(false);

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (heartTimer.current) clearTimeout(heartTimer.current);
    },
    [],
  );

  function onPhoto() {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (openTimer.current) clearTimeout(openTimer.current);
      setHeart(true);
      if (heartTimer.current) clearTimeout(heartTimer.current);
      heartTimer.current = setTimeout(() => setHeart(false), HEART_MS);
      onLike(post);
      return;
    }
    lastTap.current = now;
    openTimer.current = setTimeout(() => onOpen(post.id), DOUBLE_TAP_MS);
  }

  const likes = post.counts.likes === 1 ? '1 curtida' : `${post.counts.likes} curtidas`;
  const comments =
    post.counts.comments === 1 ? '1 comentário' : `${post.counts.comments} comentários`;

  return (
    <Animated.View
      entering={FadeInUp.duration(duration(motion.slow))}
      style={[shadows.md, styles.shadow, { backgroundColor: colors.surfaceRaised }]}
    >
      <View style={styles.card}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`Abrir resgate de ${post.author.name}, ${post.approxLabel}`}
          pressedScale={0.99}
          onPress={() => onOpen(post.id)}
          style={styles.head}
        >
          <Avatar
            name={post.author.name}
            uri={post.author.avatarUrl}
            size="md"
            ring={post.urgency === 'high' ? 'urgent' : undefined}
            verified={post.author.verified}
          />
          <View style={styles.headText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {post.author.name}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {formatWhen(post.createdAt)}
            </AppText>
          </View>
          <StatusPill urgency={post.urgency} />
        </Touchable>

        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Foto do animal. Toque para abrir, toque duas vezes para curtir."
          onPress={onPhoto}
          style={[styles.photoFrame, { backgroundColor: colors.surfaceMuted }]}
        >
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={styles.photo}
              contentFit="cover"
              transition={motion.base}
              cachePolicy="memory-disk"
              recyclingKey={post.id}
            />
          ) : (
            <View style={styles.photoEmpty}>
              <Icon name="camera" size="xl" color={colors.textDisabled} />
            </View>
          )}
          <PhotoScrim stop={0.5} />
          <View style={styles.overlay}>
            <StatusPill status={post.status} />
            {post.media.length > 1 ? <Badge kind="label" label={`1/${post.media.length}`} /> : null}
          </View>
          <View style={styles.caption} pointerEvents="none">
            <AppText variant="h2" numberOfLines={1} style={{ color: colors.onMedia }}>
              {animalHeadline(post.animal)}
            </AppText>
            <View style={styles.place}>
              <Icon name="map-pin" size="sm" color={colors.onMedia} />
              <AppText
                variant="bodySmall"
                numberOfLines={1}
                style={[styles.placeText, { color: colors.onMedia }]}
              >
                {post.approxLabel}
              </AppText>
            </View>
          </View>
          {heart ? (
            <Animated.View
              pointerEvents="none"
              entering={ZoomIn.duration(duration(motion.base))}
              style={styles.heart}
            >
              <Icon name="heart" size="xl" color={colors.onMedia} />
            </Animated.View>
          ) : null}
        </Pressable>

        <AppText numberOfLines={3} style={styles.description}>
          {post.description}
        </AppText>
        <AppText variant="bodySmall" color="textSecondary" style={styles.counts}>
          {likes} · {comments}
          {post.liked ? ' · você curtiu' : ''}
        </AppText>
        {post.status === 'open' ? (
          <View style={styles.help}>
            <Button
              title="Eu vou ajudar"
              icon="heart"
              variant="secondary"
              fullWidth
              onPress={() => onOpen(post.id)}
            />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // The shadow lives on the outer view: the card clips its photo, which would clip the shadow.
  shadow: { marginHorizontal: spacing.lg, marginBottom: spacing.xl, borderRadius: radius.xl },
  card: { borderRadius: radius.xl, overflow: 'hidden', paddingBottom: spacing.lg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  headText: { flex: 1 },
  photoFrame: { width: '100%', aspectRatio: 1 },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  caption: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.xs },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flex: 1 },
  heart: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  description: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  counts: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  help: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
