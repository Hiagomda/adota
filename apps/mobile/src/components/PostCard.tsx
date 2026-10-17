import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { animalHeadline } from '../animalLabels';
import { distanceLabel } from '../format';
import { useViewerLocation } from '../place/deviceLocation';
import { motion, radius, size, spacing, useMotionDuration, useTheme } from '../theme';
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
  const lastTap = useRef(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [heart, setHeart] = useState(false);
  const [frameWidth, setFrameWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    setPhotoIndex(0);
  }, [post.id]);

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

  const here = useViewerLocation();
  const away = distanceLabel(here, post.location);
  const likes = post.counts.likes === 1 ? '1 curtida' : `${post.counts.likes} curtidas`;
  const comments =
    post.counts.comments === 1 ? '1 comentário' : `${post.counts.comments} comentários`;

  return (
    <Animated.View
      entering={FadeInUp.duration(duration(motion.slow))}
      style={[shadows.md, styles.shadow, { backgroundColor: colors.surfaceRaised }]}
    >
      <View style={styles.card}>
        <View
          style={[styles.photoFrame, { backgroundColor: colors.surfaceMuted }]}
          onLayout={(event) => {
            const nextWidth = Math.round(event.nativeEvent.layout.width);
            const nextHeight = Math.round(event.nativeEvent.layout.height);
            setFrameWidth((current) => (current === nextWidth ? current : nextWidth));
            setFrameHeight((current) => (current === nextHeight ? current : nextHeight));
          }}
        >
          {post.media.length > 0 && frameWidth === 0 ? (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="Foto do animal. Toque para abrir, toque duas vezes para curtir."
              onPress={onPhoto}
              style={styles.photo}
            >
              <Image
                source={{ uri: post.media[0]?.thumbUrl || post.media[0]?.url }}
                style={styles.photo}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={post.id}
              />
            </Pressable>
          ) : post.media.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={{ width: frameWidth, height: frameHeight }}
              onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
                if (frameWidth <= 0) return;
                const next = Math.round(event.nativeEvent.contentOffset.x / frameWidth);
                setPhotoIndex(Math.min(Math.max(next, 0), post.media.length - 1));
              }}
            >
              {post.media.map((media, index) => (
                <Pressable
                  key={media.url}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Foto ${index + 1} de ${post.media.length}. Toque para abrir, toque duas vezes para curtir.`}
                  onPress={onPhoto}
                  style={{ width: frameWidth, height: frameHeight }}
                >
                  <Image
                    source={{ uri: media.thumbUrl || media.url }}
                    style={styles.photo}
                    contentFit="cover"
                    transition={motion.base}
                    cachePolicy="memory-disk"
                    recyclingKey={`${post.id}-${index}`}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="Foto do animal. Toque para abrir, toque duas vezes para curtir."
              onPress={onPhoto}
              style={styles.photoEmpty}
            >
              <Icon name="camera" size="xl" color={colors.textDisabled} />
            </Pressable>
          )}
          {/* Both edges carry text over the photo: author on top, name and place at the bottom. */}
          <PhotoScrim edge="top" stop={0.7} />
          <PhotoScrim stop={0.5} />
          <View style={styles.overlay} pointerEvents="box-none">
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Abrir resgate de ${post.author.name}`}
              pressedScale={0.98}
              onPress={() => onOpen(post.id)}
              style={styles.authorChip}
            >
              <Avatar
                name={post.author.name}
                uri={post.author.avatarUrl}
                size="sm"
                verified={post.author.verified}
              />
              <AppText
                variant="bodySmallStrong"
                numberOfLines={1}
                style={{ color: colors.onMedia, flex: 1 }}
              >
                {post.author.name}
              </AppText>
            </Touchable>
            <View style={styles.overlayMeta} pointerEvents="none">
              {/* Urgency only matters while nobody has the animal yet. */}
              {post.status === 'open' ? (
                <StatusPill urgency={post.urgency} />
              ) : (
                <StatusPill status={post.status} />
              )}
              {post.media.length > 1 ? (
                <Badge kind="label" label={`${photoIndex + 1}/${post.media.length}`} />
              ) : null}
            </View>
          </View>
          <View style={styles.caption} pointerEvents="none">
            <AppText variant="h2" numberOfLines={1} style={{ color: colors.onMedia }}>
              {animalHeadline(post.animal)}
            </AppText>
            <View style={styles.place}>
              <Icon name="map-pin" size="sm" color={colors.onMedia} />
              <AppText
                variant="bodySmall"
                numberOfLines={2}
                style={[styles.placeText, { color: colors.onMedia }]}
              >
                {away ? `${post.approxLabel} · ${away}` : post.approxLabel}
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
        </View>

        <AppText numberOfLines={3} style={styles.description}>
          {post.description}
        </AppText>
        <View style={styles.actions}>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`${post.liked ? 'Descurtir' : 'Curtir'}. ${likes}`}
            accessibilityState={{ selected: post.liked }}
            pressedScale={0.92}
            onPress={() => onLike(post)}
            style={styles.action}
          >
            <Icon
              name="heart"
              size="md"
              color={post.liked ? colors.onSecondarySoft : colors.text}
            />
            <AppText
              variant="bodySmallStrong"
              style={{ color: post.liked ? colors.onSecondarySoft : colors.text }}
            >
              {post.counts.likes}
            </AppText>
          </Touchable>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`${comments}. Abrir resgate`}
            pressedScale={0.92}
            onPress={() => onOpen(post.id)}
            style={styles.action}
          >
            <Icon name="message-circle" size="md" color={colors.text} />
            <AppText variant="bodySmallStrong">{post.counts.comments}</AppText>
          </Touchable>
          <View style={styles.spacer} />
          {post.status === 'open' ? (
            <Button
              title="Vou ajudar"
              icon="heart"
              variant="secondary"
              onPress={() => onOpen(post.id)}
            />
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // The shadow lives on the outer view: the card clips its photo, which would clip the shadow.
  shadow: { marginHorizontal: spacing.lg, marginBottom: spacing.xl, borderRadius: radius.xl },
  card: { borderRadius: radius.xl, overflow: 'hidden', paddingBottom: spacing.lg },
  photoFrame: { width: '100%', aspectRatio: 4 / 5 },
  // The author's name gives way first; the status pill always shows in full.
  authorChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  overlayMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
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
  caption: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.xs,
  },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flex: 1 },
  heart: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  description: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.lg,
  },
  // 44 px targets; the inner padding lines the first icon up with the text above.
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: size.touch,
    minWidth: size.touch,
    paddingHorizontal: spacing.sm,
  },
  spacer: { flex: 1 },
});
