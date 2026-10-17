import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { motion, radius, size as sizeTokens, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: keyof typeof sizeTokens.avatar;
  /**
   * Colored ring: red for an urgent rescue, white over the turquoise header, `story` is the
   * warm gradient of a story not seen yet and `seen` the gray one after it was opened.
   */
  ring?: 'urgent' | 'light' | 'story' | 'seen';
  verified?: boolean;
}

export function Avatar({ name, uri, size = 'md', ring, verified = false }: AvatarProps) {
  const { colors } = useTheme();
  const dimension = sizeTokens.avatar[size];
  const circle = { width: dimension, height: dimension, borderRadius: radius.pill };
  const badge = Math.max(16, Math.round(dimension * 0.34));
  // Gradient rings are drawn by an Svg behind the photo; the flat ones are a plain border.
  const drawn = ring === 'story' || ring === 'seen';
  const outer = dimension + (ring ? 8 : 0);
  const stroke = ring === 'story' ? 2.5 : 1.5;
  const gradientId = `avatar-ring-${ring ?? 'none'}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Foto de ${name}${verified ? ', perfil verificado' : ''}`}
      style={[
        circle,
        ring && !drawn
          ? {
              borderWidth: 2,
              borderColor: ring === 'light' ? colors.onHero : colors.error,
              padding: 2,
            }
          : null,
        drawn ? styles.drawn : null,
        { width: outer, height: outer },
      ]}
    >
      {drawn ? (
        <Svg width={outer} height={outer} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <Stop offset={0} stopColor={ring === 'story' ? colors.caramel : colors.border} />
              <Stop offset={0.5} stopColor={ring === 'story' ? colors.secondary : colors.border} />
              <Stop offset={1} stopColor={ring === 'story' ? colors.error : colors.borderStrong} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={outer / 2}
            cy={outer / 2}
            r={(outer - stroke) / 2}
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            fill="none"
          />
        </Svg>
      ) : null}
      {uri ? (
        <Image
          source={{ uri }}
          style={[circle, styles.fill]}
          contentFit="cover"
          transition={motion.fast}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[circle, styles.fill, styles.letter, { backgroundColor: colors.primarySoft }]}>
          <AppText
            variant={size === 'xl' ? 'display' : size === 'lg' ? 'h2' : 'bodyStrong'}
            style={{ color: colors.onPrimarySoft }}
          >
            {name.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
      )}
      {verified ? (
        <View
          style={[
            styles.verified,
            {
              width: badge,
              height: badge,
              backgroundColor: colors.primary,
              borderColor: colors.background,
            },
          ]}
        >
          <Icon name="check" size="sm" color={colors.onPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  // Room between the gradient ring and the photo, like a story bubble.
  drawn: { padding: 4 },
  letter: { alignItems: 'center', justifyContent: 'center' },
  verified: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
