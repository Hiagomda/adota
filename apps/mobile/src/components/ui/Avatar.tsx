import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { motion, radius, size as sizeTokens, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: keyof typeof sizeTokens.avatar;
  /** Colored ring: red for an urgent rescue, white over the turquoise header. */
  ring?: 'urgent' | 'light';
  verified?: boolean;
}

export function Avatar({ name, uri, size = 'md', ring, verified = false }: AvatarProps) {
  const { colors } = useTheme();
  const dimension = sizeTokens.avatar[size];
  const circle = { width: dimension, height: dimension, borderRadius: radius.pill };
  const badge = Math.max(16, Math.round(dimension * 0.34));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Foto de ${name}${verified ? ', perfil verificado' : ''}`}
      style={[
        circle,
        ring
          ? { borderWidth: 2, borderColor: ring === 'light' ? colors.onHero : colors.error, padding: 2 }
          : null,
        { width: dimension + (ring ? 8 : 0), height: dimension + (ring ? 8 : 0) },
      ]}
    >
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
