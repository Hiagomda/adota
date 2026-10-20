import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { BounceIn, FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { siteUrl } from '../api';
import { animalHeadline, neighborhoodOf } from '../animalLabels';
import { reportError } from '../crash/reporter';
import { distanceLabel, formatWhen } from '../format';
import { useViewerLocation } from '../place/deviceLocation';
import { motion, radius, size, spacing, useMotionDuration, useTheme } from '../theme';
import type { Post } from '../types';
import { AppText, Avatar, Badge, Button, Icon, Photo, StatusPill, Touchable } from './ui';

interface PostCardProps {
  post: Post;
  onOpen: (id: string) => void;
  onLike: (post: Post) => void;
}

const DOUBLE_TAP_MS = 280;
const HEART_MS = 800;
const HEART_SIZE = 96;
const ACTION_SIZE = 26;

export const PostCard = memo(function PostCard({ post, onOpen, onLike }: PostCardProps) {
  const { colors } = useTheme();
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
  const placeLine = away ? `${neighborhoodOf(post.approxLabel)} · ${away}` : post.approxLabel;
  // Aberto e urgente é como um story que ninguém atendeu ainda: o anel quente em volta do autor.
  const ring = post.status === 'open' && post.urgency === 'high' ? 'story' : undefined;

  function share() {
    Share.share({
      message: `${animalHeadline(post.animal)} em ${post.approxLabel} no Égua, adota! ${siteUrl}/p/${post.id}`,
      url: `${siteUrl}/p/${post.id}`,
    }).catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'feed:share' });
    });
  }

  return (
    <Animated.View
      entering={FadeIn.duration(duration(motion.slow))}
      style={[styles.card, { borderBottomColor: colors.border }]}
    >
      {/* Cabeçalho no estilo de feed social: quem postou, onde, e como está o resgate. */}
      <View style={styles.head}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`Abrir resgate de ${post.author.name}`}
          pressedScale={0.98}
          onPress={() => onOpen(post.id)}
          style={styles.author}
        >
          <Avatar
            name={post.author.name}
            uri={post.author.avatarUrl}
            size="sm"
            ring={ring}
            verified={post.author.verified}
          />
          <View style={styles.authorText}>
            <AppText variant="bodySmallStrong" numberOfLines={1}>
              {post.author.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {placeLine}
            </AppText>
          </View>
        </Touchable>
        {/* A urgência só importa enquanto ninguém está com o animal. */}
        {post.status === 'open' ? (
          <StatusPill urgency={post.urgency} />
        ) : (
          <StatusPill status={post.status} />
        )}
      </View>

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
            <Photo
              uri={post.media[0]?.thumbUrl || post.media[0]?.url}
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
                <Photo
                  uri={media.thumbUrl || media.url}
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
        {post.media.length > 1 ? (
          <View style={styles.counter} pointerEvents="none">
            <Badge kind="label" label={`${photoIndex + 1}/${post.media.length}`} />
          </View>
        ) : null}
        {heart ? (
          <Animated.View
            pointerEvents="none"
            entering={ZoomIn.springify().duration(duration(motion.slow))}
            exiting={FadeOut.duration(duration(motion.fast))}
            style={styles.heart}
          >
            <Ionicons name="heart" size={HEART_SIZE} color={colors.onMedia} />
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`${post.liked ? 'Descurtir' : 'Curtir'}. ${likes}`}
          accessibilityState={{ selected: post.liked }}
          pressedScale={0.85}
          onPress={() => onLike(post)}
          style={styles.action}
        >
          <Animated.View
            key={post.liked ? 'on' : 'off'}
            entering={post.liked ? BounceIn.duration(duration(motion.slow)) : undefined}
          >
            <Ionicons
              name={post.liked ? 'heart' : 'heart-outline'}
              size={ACTION_SIZE}
              color={post.liked ? colors.secondary : colors.text}
            />
          </Animated.View>
        </Touchable>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={`${comments}. Abrir resgate`}
          pressedScale={0.85}
          onPress={() => onOpen(post.id)}
          style={styles.action}
        >
          <Ionicons name="chatbubble-outline" size={ACTION_SIZE - 2} color={colors.text} />
        </Touchable>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar resgate"
          pressedScale={0.85}
          onPress={share}
          style={styles.action}
        >
          <Ionicons name="paper-plane-outline" size={ACTION_SIZE - 2} color={colors.text} />
        </Touchable>
        {post.media.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {post.media.map((media, index) => (
              <View
                key={media.url}
                style={[
                  styles.dot,
                  { backgroundColor: index === photoIndex ? colors.primary : colors.borderStrong },
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={styles.spacer} />
        )}
        {post.status === 'open' ? (
          <Button
            title="Vou ajudar"
            icon="heart"
            variant="secondary"
            onPress={() => onOpen(post.id)}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        {post.counts.likes > 0 ? <AppText variant="bodySmallStrong">{likes}</AppText> : null}
        <AppText variant="h3" numberOfLines={1}>
          {animalHeadline(post.animal)}
        </AppText>
        <AppText variant="bodySmall" numberOfLines={3}>
          <AppText variant="bodySmallStrong">{post.author.name} </AppText>
          {post.description}
        </AppText>
        {post.counts.comments > 0 ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Ver ${comments}`}
            pressedScale={0.98}
            onPress={() => onOpen(post.id)}
            style={styles.more}
          >
            <AppText variant="bodySmall" color="textSecondary">
              {post.counts.comments === 1 ? 'Ver o comentário' : `Ver os ${comments}`}
            </AppText>
          </Touchable>
        ) : null}
        <AppText variant="caption" color="textSecondary">
          {formatWhen(post.createdAt)}
        </AppText>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // De ponta a ponta como num feed social: sem margem lateral, uma linha fina entre os posts.
  card: { paddingBottom: spacing.lg, marginBottom: spacing.sm, borderBottomWidth: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // O nome do autor encolhe primeiro; a pílula de status sempre aparece inteira.
  author: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: size.touch,
  },
  authorText: { flex: 1 },
  photoFrame: { width: '100%', aspectRatio: 4 / 5 },
  photo: { width: '100%', height: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', top: spacing.md, right: spacing.md },
  heart: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingRight: spacing.md,
    paddingTop: spacing.xs,
  },
  // Alvos de 44 px em volta dos ícones de 26 px.
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: size.touch,
    minWidth: size.touch,
  },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  spacer: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, gap: 2 },
  more: {
    alignSelf: 'flex-start',
    minHeight: size.touch / 2 + spacing.sm,
    justifyContent: 'center',
  },
});
