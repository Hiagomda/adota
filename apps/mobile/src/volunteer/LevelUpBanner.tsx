import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { AppText, Button, Card, PawBurst } from '../components/ui';
import { logBestEffort } from '../crash/bestEffort';
import { Mascot } from '../mascot';
import {
  easing,
  motion,
  radius,
  spacing,
  useMotionDuration,
  useTheme,
  type ColorRoles,
} from '../theme';

const MASCOT_SIZE = 72;
const RIBBON_HEIGHT = 6;
const RIBBON_MS = 700;
const RIBBON_STAGGER_MS = 90;

/** The Círio ribbons, in app colors: each one unrolls from the left after the other. */
const ribbonColors: (keyof ColorRoles)[] = ['secondary', 'caramel', 'primary', 'success'];

function Ribbon({ index, color }: { index: number; color: string }) {
  const reduce = useReducedMotion();
  const unroll = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    unroll.value = withDelay(
      index * RIBBON_STAGGER_MS,
      withTiming(1, { duration: RIBBON_MS, easing: easing.bounce }),
    );
  }, [index, reduce, unroll]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: unroll.value }] }));
  return <Animated.View style={[styles.ribbon, { backgroundColor: color }, style]} />;
}

export interface LevelUpBannerProps {
  levelName: string;
  /** Nomes do que o nível novo liberou no armário do Cupu. */
  unlocks?: string[];
  onClose: () => void;
}

/** Shown once on "Sua rede" when the person reached a new level since the last visit. */
export function LevelUpBanner({ levelName, unlocks = [], onClose }: LevelUpBannerProps) {
  const { colors } = useTheme();
  const duration = useMotionDuration();
  // Starts at 1 so the burst plays as soon as the banner appears.
  const [burst] = useState(1);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      logBestEffort('level-up:haptic'),
    );
    AccessibilityInfo.announceForAccessibility(`Você subiu de nível. Agora você é ${levelName}.`);
  }, [levelName]);

  return (
    <Animated.View entering={FadeInDown.duration(duration(motion.slow))}>
      <Card elevation="md" padding="none">
        <View style={styles.ribbons}>
          {ribbonColors.map((role, index) => (
            <Ribbon key={role} index={index} color={colors[role]} />
          ))}
        </View>
        <View style={styles.body}>
          <View>
            <Mascot pose="party" size={MASCOT_SIZE} />
            <PawBurst trigger={burst} size={24} />
          </View>
          <View style={styles.text}>
            <AppText variant="h3">Subiu de nível!</AppText>
            <AppText color="textSecondary">Agora você é {levelName}. Égua, que orgulho!</AppText>
            {unlocks.length > 0 ? (
              <AppText variant="bodySmall" color="textSecondary">
                Liberou pro Cupu: {unlocks.join(', ')}.
              </AppText>
            ) : null}
            <Button title="Valeu!" variant="ghost" onPress={onClose} style={styles.close} />
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ribbons: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  ribbon: {
    height: RIBBON_HEIGHT,
    borderRadius: radius.pill,
    transformOrigin: 'left',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  text: { flex: 1, gap: spacing.xs },
  close: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
