import { StyleSheet } from 'react-native';
import Animated, { BounceIn } from 'react-native-reanimated';
import { motion, radius, size, useMotionDuration, useTheme } from '../../theme';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export interface FavoriteButtonProps {
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}

/** Heart over a photo. Turning it on makes the heart hop (remount with a bounce) and buzzes lightly. */
export function FavoriteButton({ active, onPress, accessibilityLabel }: FavoriteButtonProps) {
  const { colors } = useTheme();
  const duration = useMotionDuration();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      haptic={active ? false : 'light'}
      pressedScale={0.9}
      onPress={onPress}
      style={[
        styles.base,
        { backgroundColor: active ? colors.secondary : colors.mediaScrim },
      ]}
    >
      <Animated.View
        key={active ? 'on' : 'off'}
        entering={active ? BounceIn.duration(duration(motion.slow)) : undefined}
      >
        <Icon name="heart" size="lg" color={active ? colors.onSecondary : colors.onMedia} />
      </Animated.View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
