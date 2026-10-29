import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from '../components/ui/AppText';
import { logBestEffort } from '../crash/bestEffort';
import { Mascot, type MascotPose } from '../mascot';
import { motion, radius, spacing, useMotionDuration, useTheme } from '../theme';
import type { CupuAccessory as CupuAccessoryCode, CupuScene as CupuSceneCode } from './catalog';
import { CupuAccessory, CupuScene } from './CupuArt';
import { useCupuStyle } from './useCupu';

/** O que o Cupu fala quando alguém toca nele. Curto, para não atrapalhar. */
const phrases = [
  'Égua, que cafuné bom!',
  'Bora ajudar mais um?',
  'Au! Valeu por cuidar dos bichinhos.',
  'Tô de olho na vizinhança.',
  'Já bebeste água hoje? Eu já!',
  'Cada ajuda tua me deixa todo bobo.',
] as const;

const HOP_MS = 120;
const BUBBLE_MS = 2400;
/** A ilustração ocupa quase todo o quadro e deixa a borda para o cenário e o enfeite. */
const FIGURE_RATIO = 0.84;

export interface CupuProps {
  size: number;
  /** A expressão do momento. Sem ela, vale a pose que a pessoa escolheu no armário. */
  pose?: MascotPose;
  /** `null` tira o cenário (estados vazios). Sem valor, vale o da pessoa. */
  scene?: CupuSceneCode | null;
  accessory?: CupuAccessoryCode;
  /** Tocar faz o Cupu pular e falar. Desligue em telas de pressa. */
  interactive?: boolean;
  label?: string;
}

/**
 * O Cupu (Cupuaçu) com o cenário e o enfeite que a pessoa liberou. Sem animação parada em loop:
 * ele só se mexe quando alguém toca, e com movimento reduzido só fala.
 */
export function Cupu({
  size,
  pose,
  scene,
  accessory,
  interactive = false,
  label = 'Cupu, o mascote do Égua, adota!',
}: CupuProps) {
  const style = useCupuStyle();
  const { colors, shadows } = useTheme();
  const reduce = useReducedMotion();
  const duration = useMotionDuration();
  const hop = useSharedValue(0);
  const tilt = useSharedValue(0);
  const [phrase, setPhrase] = useState<string | null>(null);
  const turn = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const moving = useAnimatedStyle(() => ({
    transform: [{ translateY: hop.value }, { rotate: `${tilt.value}deg` }],
  }));

  const shownScene = scene === undefined ? style.scene : scene;
  const shownAccessory = accessory ?? style.accessory;
  // Sem cenário não há borda para guardar: o Cupu ocupa o quadro todo, como o Mascot de antes.
  const figure = shownScene ? Math.round(size * FIGURE_RATIO) : size;

  function poke() {
    const next = phrases[turn.current % phrases.length] ?? phrases[0];
    turn.current += 1;
    setPhrase(next);
    AccessibilityInfo.announceForAccessibility(`Cupu: ${next}`);
    Haptics.selectionAsync().catch(logBestEffort('cupu:poke-haptic'));
    if (!reduce) {
      hop.set(
        withSequence(
          withTiming(-size * 0.06, { duration: HOP_MS }),
          withSpring(0, { damping: 9, stiffness: 220 }),
        ),
      );
      tilt.set(
        withSequence(
          withTiming(-5, { duration: HOP_MS }),
          withTiming(4, { duration: HOP_MS }),
          withSpring(0),
        ),
      );
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPhrase(null), BUBBLE_MS);
  }

  const body = (
    <View style={{ width: size, height: size }}>
      {shownScene ? (
        <View
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <CupuScene scene={shownScene} size={size} />
        </View>
      ) : null}
      <Animated.View style={[styles.figure, moving]}>
        <Mascot pose={pose ?? style.pose} size={figure} />
      </Animated.View>
      <View
        style={[StyleSheet.absoluteFill, styles.passThrough]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <CupuAccessory accessory={shownAccessory} size={size} />
      </View>
      {phrase ? (
        <Animated.View
          entering={FadeIn.duration(duration(motion.fast))}
          exiting={FadeOut.duration(duration(motion.fast))}
          style={[
            styles.bubble,
            styles.passThrough,
            shadows.sm,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <AppText variant="caption" style={styles.bubbleText}>
            {phrase}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );

  if (!interactive) {
    return (
      <View accessible={Boolean(label)} accessibilityRole="image" accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={poke}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Toque para o Cupu dizer alguma coisa"
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  figure: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bubble: {
    position: 'absolute',
    top: -spacing.sm,
    left: '50%',
    maxWidth: 180,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleText: { textAlign: 'left' },
  passThrough: { pointerEvents: 'none' },
});
