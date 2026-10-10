import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import {
  motion,
  radius,
  size,
  spacing,
  STAGGER_MS,
  useMotionDuration,
  useTheme,
} from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PhotoScrim } from './PhotoScrim';
import { StatusPill } from './StatusPill';
import { Touchable } from './Touchable';

export interface AnimalCardProps {
  photoUri?: string | null;
  title: string;
  /** Place and time, drawn under the title. */
  subtitle?: string;
  status?: string;
  urgency?: 'high' | 'medium' | 'low';
  /** `large` for the carousels of the home, `compact` for grids and similar animals. */
  variant?: 'large' | 'compact';
  /** Position in its list: cards enter one after another. */
  index?: number;
  onPress: () => void;
}

const MAX_STAGGER = 6;

/** Photo first: the picture fills the card, a dark gradient carries the name and the info. */
export function AnimalCard({
  photoUri,
  title,
  subtitle,
  status,
  urgency,
  variant = 'large',
  index = 0,
  onPress,
}: AnimalCardProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const large = variant === 'large';
  const dimensions = large ? size.animalLarge : size.animalCompact;
  return (
    <Animated.View
      entering={FadeInRight.delay(duration(Math.min(index, MAX_STAGGER) * STAGGER_MS)).duration(
        duration(motion.slow),
      )}
      style={[shadows.md, styles.shadow, dimensions, { backgroundColor: colors.surfaceMuted }]}
    >
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        pressedScale={0.97}
        haptic="light"
        onPress={onPress}
        style={[styles.card, { backgroundColor: colors.surfaceMuted }]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={motion.base}
            cachePolicy="memory-disk"
            recyclingKey={photoUri}
          />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="camera" size="xl" color={colors.textDisabled} />
          </View>
        )}
        <PhotoScrim stop={0.35} />
        <View style={styles.pills}>
          {status ? <StatusPill status={status} /> : null}
          {urgency === 'high' ? <StatusPill urgency="high" /> : null}
        </View>
        <View style={styles.info}>
          <AppText
            variant={large ? 'h2' : 'h3'}
            numberOfLines={2}
            style={{ color: colors.onMedia }}
          >
            {title}
          </AppText>
          {subtitle ? (
            <View style={styles.place}>
              <Icon name="map-pin" size="sm" color={colors.onMedia} />
              <AppText
                variant="bodySmall"
                numberOfLines={1}
                style={[styles.placeText, { color: colors.onMedia }]}
              >
                {subtitle}
              </AppText>
            </View>
          ) : null}
        </View>
      </Touchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The shadow lives on the outer view: the card clips its photo, which would clip the shadow.
  shadow: { borderRadius: radius.xl },
  card: { flex: 1, borderRadius: radius.xl, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pills: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  info: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.xs },
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flex: 1 },
});
