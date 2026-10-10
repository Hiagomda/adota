import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  contentMaxWidth,
  motion,
  radius,
  size,
  spacing,
  useMotionDuration,
  useTheme,
} from '../../theme';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Icon of each tab by route name. `create` is the raised center button. */
const tabIcons: Record<string, IconName> = {
  index: 'home',
  explore: 'map',
  create: 'plus',
  alerts: 'bell',
  profile: 'user',
};

const ACTIVE_SCALE = 1.08;
const CREATE_SIZE = 60;
// The center button rises this much above the pill. Small on purpose: Android does not deliver
// touches that land outside the bounds of the parent.
const CREATE_LIFT = spacing.sm + spacing.xs / 2;

/**
 * Pill that floats above the content with a soft shadow. The active tab sits inside a turquoise
 * circle that grows in; the center "+" is a coral button that rises over the pill.
 */
export function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.pill, shadows.lg, { backgroundColor: colors.tabBar }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const options = descriptors[route.key]?.options;
          const icon = tabIcons[route.name] ?? 'circle';
          const isCreate = route.name === 'create';

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }

          return (
            <View key={route.key} style={styles.slot}>
              <Touchable
                accessibilityRole="button"
                accessibilityLabel={options?.tabBarAccessibilityLabel ?? route.name}
                accessibilityState={{ selected: focused }}
                haptic={isCreate ? 'medium' : false}
                pressedScale={0.9}
                onPress={onPress}
                style={styles.touch}
              >
                {isCreate ? (
                  <View
                    style={[
                      styles.create,
                      shadows.md,
                      { backgroundColor: colors.secondary },
                    ]}
                  >
                    <Icon name={icon} size="xl" color={colors.onSecondary} />
                  </View>
                ) : (
                  <Animated.View
                    style={[
                      styles.icon,
                      {
                        backgroundColor: focused ? colors.primary : 'transparent',
                        transform: [{ scale: focused ? ACTIVE_SCALE : 1 }],
                        transitionProperty: ['backgroundColor', 'transform'],
                        transitionDuration: duration(motion.base),
                      },
                    ]}
                  >
                    <Icon
                      name={icon}
                      size="lg"
                      color={focused ? colors.onPrimary : colors.tabBarInactive}
                    />
                  </Animated.View>
                )}
              </Touchable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: CREATE_LIFT,
  },
  pill: {
    height: size.tabBar,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  touch: { alignItems: 'center', justifyContent: 'center', minWidth: size.touch, minHeight: size.touch },
  icon: {
    width: size.control,
    height: size.control,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  create: {
    width: CREATE_SIZE,
    height: CREATE_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -CREATE_LIFT }],
  },
});
