import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useScreenReader } from '../../a11y/useScreenReader';
import { motion, radius, size, spacing, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { PhotoScrim } from './PhotoScrim';
import { Touchable } from './Touchable';

export interface HeroSlide {
  id: string;
  photoUri?: string | null;
  /** Small label over the title, like "Para adoção". */
  tag: string;
  title: string;
  subtitle?: string;
}

export interface HeroCarouselProps {
  slides: HeroSlide[];
  actionLabel: string;
  onOpen: (id: string) => void;
}

/** Time each slide stays before the next one comes in. */
const ADVANCE_MS = 6000;

/**
 * Full-width banner that pages sideways, in the style of streaming apps: a big photo, a strong
 * gradient at the bottom with the name, and a button. It advances alone until the person touches
 * it, and never under a screen reader.
 */
export function HeroCarousel({ slides, actionLabel, onOpen }: HeroCarouselProps) {
  const { colors } = useTheme();
  const duration = useMotionDuration();
  const screenReader = useScreenReader();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  // Reduced motion turns durations to zero: then the banner stays put too.
  const still = duration(motion.base) === 0;
  const count = slides.length;

  // The list can shrink after a refresh: past the end means back to the first slide.
  const current = index < count ? index : 0;

  useEffect(() => {
    if (touched || screenReader || still || count < 2 || width === 0) return undefined;
    const timer = setTimeout(() => {
      const next = (current + 1) % count;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [count, current, screenReader, still, touched, width]);

  if (count === 0) return null;

  function onSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(next, 0), count - 1));
  }

  return (
    <View
      style={[styles.frame, { backgroundColor: colors.mediaBackground }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
    >
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => setTouched(true)}
          onMomentumScrollEnd={onSettle}
        >
          {slides.map((slide, position) => (
            <Touchable
              key={slide.id}
              accessibilityRole="button"
              accessibilityLabel={`${slide.tag}: ${slide.title}${slide.subtitle ? `, ${slide.subtitle}` : ''}. Destaque ${position + 1} de ${count}`}
              pressedScale={0.99}
              onPress={() => onOpen(slide.id)}
              style={{ width, height: size.homeFeature }}
            >
              {slide.photoUri ? (
                <Image
                  source={{ uri: slide.photoUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={motion.base}
                  cachePolicy="memory-disk"
                  recyclingKey={slide.id}
                />
              ) : (
                <View style={[styles.empty, { backgroundColor: colors.surfaceMuted }]}>
                  <Icon name="camera" size="xl" color={colors.textDisabled} />
                </View>
              )}
              <PhotoScrim edge="top" stop={0.75} />
              <PhotoScrim stop={0.3} />
              <View style={styles.copy} pointerEvents="box-none">
                <View style={[styles.tag, { backgroundColor: colors.secondary }]}>
                  <AppText variant="caption" style={{ color: colors.onSecondary }}>
                    {slide.tag.toUpperCase()}
                  </AppText>
                </View>
                <AppText variant="display" numberOfLines={1} style={{ color: colors.onMedia }}>
                  {slide.title}
                </AppText>
                {slide.subtitle ? (
                  <AppText
                    variant="bodySmallStrong"
                    numberOfLines={1}
                    style={{ color: colors.onMedia }}
                  >
                    {slide.subtitle}
                  </AppText>
                ) : null}
                <View style={styles.action}>
                  <Button title={actionLabel} icon="heart" onPress={() => onOpen(slide.id)} />
                </View>
              </View>
            </Touchable>
          ))}
        </ScrollView>
      ) : null}
      {count > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((slide, position) => (
            <Animated.View
              key={slide.id}
              style={[
                styles.dot,
                {
                  width: position === current ? spacing.xl : spacing.sm,
                  backgroundColor: position === current ? colors.onMedia : colors.onMediaMuted,
                  transitionProperty: ['width', 'backgroundColor'],
                  transitionDuration: duration(motion.base),
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', height: size.homeFeature, overflow: 'hidden' },
  empty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  copy: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xxxl,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  action: { paddingTop: spacing.sm },
  dots: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: { height: spacing.xs + 2, borderRadius: radius.pill },
});
