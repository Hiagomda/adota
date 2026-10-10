import * as Haptics from 'expo-haptics';
import { useCallback, useState, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { motion, useMotionDuration, useTheme } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressState {
  pressed: boolean;
}

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode | ((state: PressState) => ReactNode);
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  haptic?: 'light' | 'medium' | 'success' | false;
  pressedScale?: number;
}

/**
 * Base of every tappable thing: scale feedback (150 ms), optional haptic and a focus ring
 * for keyboards and switch access. Callers supply the accessibility role and label.
 */
export function Touchable({
  children,
  style,
  haptic = false,
  pressedScale = 0.97,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  onFocus,
  onBlur,
  ...rest
}: TouchableProps) {
  const { colors } = useTheme();
  const duration = useMotionDuration();
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true);
      onPressIn?.(event);
    },
    [onPressIn],
  );
  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      onPressOut?.(event);
    },
    [onPressOut],
  );
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (haptic === 'success') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
      } else if (haptic) {
        void Haptics.impactAsync(
          haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
        ).catch(() => undefined);
      }
      onPress?.(event);
    },
    [haptic, onPress],
  );

  const state: PressState = { pressed };
  const resolvedStyle = typeof style === 'function' ? style(state) : style;
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        resolvedStyle,
        {
          transform: [{ scale: pressed ? pressedScale : 1 }],
          transitionProperty: 'transform',
          transitionDuration: duration(motion.fast),
        },
        focused ? { outlineColor: colors.focusRing, outlineWidth: 2, outlineOffset: 2 } : null,
      ]}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}
