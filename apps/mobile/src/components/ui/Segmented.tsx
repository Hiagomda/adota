import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion, radius, size, spacing, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Touchable } from './Touchable';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `pill` is a filled control; `underline` is a row of tabs. */
  variant?: 'pill' | 'underline';
  accessibilityLabel: string;
}

const PADDING = spacing.xs;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
  accessibilityLabel,
}: SegmentedProps<T>) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const inset = variant === 'pill' ? PADDING : 0;
  const segment = options.length > 0 ? (width - inset * 2) / options.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(index * segment, {
      duration: duration(motion.base),
      easing: Easing.out(Easing.cubic),
    });
  }, [duration, index, offset, segment]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[
        variant === 'pill' ? styles.pill : styles.underline,
        variant === 'pill'
          ? { backgroundColor: colors.surfaceMuted }
          : { borderBottomColor: colors.border },
      ]}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            variant === 'pill' ? styles.thumb : styles.bar,
            variant === 'pill' ? shadows.sm : null,
            {
              width: segment,
              backgroundColor: variant === 'pill' ? colors.surface : colors.primary,
              left: inset,
            },
            indicator,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Touchable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            haptic="light"
            pressedScale={0.97}
            onPress={() => onChange(option.value)}
            style={styles.item}
          >
            <AppText
              variant="bodySmallStrong"
              color={selected ? (variant === 'pill' ? 'text' : 'primary') : 'textSecondary'}
            >
              {option.label}
            </AppText>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    padding: PADDING,
    borderRadius: radius.pill,
  },
  underline: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { position: 'absolute', top: PADDING, bottom: PADDING, borderRadius: radius.pill },
  bar: { position: 'absolute', bottom: 0, height: 3, borderRadius: radius.pill },
  item: { flex: 1, minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});
