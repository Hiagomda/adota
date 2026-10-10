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
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { MarajoaraPattern } from './MarajoaraPattern';
import { Touchable } from './Touchable';

export interface OrgCardProps {
  name: string;
  subtitle?: string;
  avatarUri?: string | null;
  verified?: boolean;
  /** Position in its list: cards enter one after another. */
  index?: number;
  onPress: () => void;
}

const BAND_HEIGHT = 56;
const MAX_STAGGER = 6;
// The avatar climbs half of its own height over the band.
const AVATAR_LIFT = size.avatar.lg / 2;

/** NGO or rescuer: a tile with a marajoara band, the avatar on top of it and the name below. */
export function OrgCard({
  name,
  subtitle,
  avatarUri,
  verified = false,
  index = 0,
  onPress,
}: OrgCardProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  return (
    <Animated.View
      entering={FadeInRight.delay(duration(Math.min(index, MAX_STAGGER) * STAGGER_MS)).duration(
        duration(motion.slow),
      )}
      style={[shadows.md, styles.shadow, { backgroundColor: colors.surfaceRaised }]}
    >
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${name}${verified ? ', perfil verificado' : ''}${subtitle ? `, ${subtitle}` : ''}`}
        pressedScale={0.97}
        onPress={onPress}
        style={[styles.card, { backgroundColor: colors.surfaceRaised }]}
      >
        <View style={[styles.band, { backgroundColor: colors.primarySoft }]}>
          <MarajoaraPattern color={colors.primary} opacity={0.18} />
        </View>
        <View style={styles.body}>
          <View style={[styles.avatar, { borderColor: colors.surfaceRaised }]}>
            <Avatar name={name} uri={avatarUri} size="lg" verified={verified} />
          </View>
          <AppText variant="h3" numberOfLines={1} style={styles.name}>
            {name}
          </AppText>
          {subtitle ? (
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
          {verified ? <Badge kind="label" label="Verificado" tone="primary" /> : null}
        </View>
      </Touchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { width: size.orgCard.width, borderRadius: radius.xl },
  card: { borderRadius: radius.xl, overflow: 'hidden' },
  band: { height: BAND_HEIGHT },
  body: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    marginTop: -AVATAR_LIFT,
    borderWidth: spacing.xs,
    borderRadius: radius.pill,
  },
  name: { alignSelf: 'stretch' },
});
