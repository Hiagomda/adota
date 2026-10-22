import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AppText, Button, Icon, Touchable, type IconName } from '../components/ui';
import { Mascot, type MascotPose } from '../mascot';
import { useSession } from '../session';
import { motion, radius, spacing, useMotionDuration, useTheme, type ColorRoles } from '../theme';
import { vocativeFromName } from '../vocative';
import { hasSeenCupuOnboarding, markCupuOnboardingSeen } from './onboardingStorage';

interface Step {
  pose: MascotPose;
  /** Fundo do quadro do Cupu, um tom suave diferente em cada passo. */
  tint: keyof ColorRoles;
  title: string;
  description: string;
  /** Linha de destaque com ícone, para o que a pessoa precisa saber antes de usar. */
  tip?: { icon: IconName; text: string };
  button: string;
}

const steps: Step[] = [
  {
    pose: 'wave',
    tint: 'primarySoft',
    title: 'Ei, mano(a)! Eu sou o Cupuaçu',
    description:
      'Mas pode me chamar de Cupu. O Égua, adota! junta quem vê, quem resgata e quem adota os bichinhos de rua de Belém. Te mostro o básico rapidinho.',
    button: 'Bora ver',
  },
  {
    pose: 'camera',
    tint: 'secondarySoft',
    title: 'Viu um bicho precisando?',
    description:
      'Toca no + do meio: a câmera abre na hora. Tira a foto, marca onde ele está e publica. Quem está perto recebe o alerta.',
    tip: {
      icon: 'shield',
      text: 'No feed aparece só a área aproximada. O ponto exato vai pra quem disser que vai ajudar.',
    },
    button: 'Entendi',
  },
  {
    pose: 'map',
    tint: 'infoSoft',
    title: 'Ajuda quem está perto',
    description:
      'No início e no mapa tu vês os alertas do teu bairro. Toca em “Vou ajudar” e combina o resgate com quem publicou.',
    button: 'E depois?',
  },
  {
    pose: 'home',
    tint: 'caramelSoft',
    title: 'Adoção e Casa Amiga',
    description:
      'Encontra um bichinho pra adotar ou abre tua casa como lar temporário até ele achar uma família.',
    button: 'Massa!',
  },
  {
    pose: 'party',
    tint: 'successSoft',
    title: 'Cada ajuda vale XP',
    description: 'Tu sobes de nível e ganhas selos como Herói Local.',
    tip: {
      icon: 'heart',
      text: 'Doação é por PIX direto pra ONG verificada. O app nunca recebe dinheiro.',
    },
    button: 'Bora lá, Cupu!',
  },
];

const CARD_MAX_WIDTH = 380;
const ART_HEIGHT = 196;
const MASCOT = 184;
const DOT = 8;
const DOT_ACTIVE = 24;

export default function CupuOnboarding() {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const { width, height } = useWindowDimensions();
  const ready = useSession((state) => state.ready);
  const cupuPrompt = useSession((state) => state.cupuPrompt);
  const clearCupuPrompt = useSession((state) => state.clearCupuPrompt);
  const userName = useSession((state) => state.user?.name);
  const userId = useSession((state) => state.user?.id);
  const pages = useMemo(
    () =>
      steps.map((item, itemIndex) =>
        itemIndex === 0
          ? { ...item, title: `Ei, ${vocativeFromName(userName)}! Eu sou o Cupuaçu` }
          : item,
      ),
    [userName],
  );
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const cardWidth = Math.min(width - spacing.lg * 2, CARD_MAX_WIDTH);
  const step = pages[index] ?? pages[0];
  const last = index === pages.length - 1;

  useEffect(() => {
    if (!ready || !cupuPrompt || !userId) return;
    let cancelled = false;
    void hasSeenCupuOnboarding(userId).then((seen) => {
      if (cancelled) return;
      if (!seen) setVisible(true);
      else clearCupuPrompt();
    });
    return () => {
      cancelled = true;
    };
  }, [clearCupuPrompt, cupuPrompt, ready, userId]);

  async function finish() {
    if (userId) await markCupuOnboardingSeen(userId);
    setVisible(false);
    setIndex(0);
    clearCupuPrompt();
  }

  function advance() {
    if (last) void finish();
    else setIndex(index + 1);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void finish()}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            shadows.lg,
            {
              width: cardWidth,
              maxHeight: height - spacing.xxl * 2,
              backgroundColor: colors.surfaceRaised,
            },
          ]}
        >
          <View style={styles.topRow}>
            <AppText variant="caption" color="textSecondary">
              {`${index + 1} de ${pages.length}`}
            </AppText>
            {last ? null : (
              <Touchable
                onPress={() => void finish()}
                accessibilityRole="button"
                accessibilityLabel="Pular apresentação"
                hitSlop={spacing.md}
                style={styles.skip}
              >
                <AppText variant="bodySmallStrong" color="textSecondary">
                  Pular
                </AppText>
              </Touchable>
            )}
          </View>

          <ScrollView bounces={false} contentContainerStyle={styles.body}>
            <Animated.View
              key={index}
              entering={FadeIn.duration(duration(motion.slow))}
              style={styles.body}
            >
              <View style={[styles.art, { backgroundColor: colors[step.tint] }]}>
                <Mascot pose={step.pose} size={MASCOT} />
              </View>
              <View style={styles.text} accessibilityLiveRegion="polite">
                <AppText variant="h2" style={styles.center} accessibilityRole="header">
                  {step.title}
                </AppText>
                <AppText color="textSecondary" style={styles.center}>
                  {step.description}
                </AppText>
              </View>
              {step.tip ? (
                <View style={[styles.tip, { backgroundColor: colors.surfaceMuted }]}>
                  <Icon name={step.tip.icon} size="sm" color={colors.primary} />
                  <AppText variant="bodySmall" style={styles.tipText}>
                    {step.tip.text}
                  </AppText>
                </View>
              ) : null}
            </Animated.View>
          </ScrollView>

          <View
            accessible
            accessibilityLabel={`Passo ${index + 1} de ${pages.length}`}
            style={styles.dots}
          >
            {pages.map((item, dot) => (
              <View
                key={item.pose}
                style={[
                  styles.dot,
                  dot === index && styles.dotActive,
                  { backgroundColor: dot === index ? colors.secondary : colors.border },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            {index > 0 ? (
              <Button
                title="Voltar"
                variant="ghost"
                size="lg"
                onPress={() => setIndex(index - 1)}
              />
            ) : null}
            <Button
              title={step.button}
              variant="secondary"
              size="lg"
              icon={last ? undefined : 'arrow-right'}
              iconPosition="right"
              onPress={advance}
              style={styles.next}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: spacing.xxl,
  },
  skip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  body: { gap: spacing.lg },
  art: {
    height: ART_HEIGHT,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  text: { gap: spacing.sm },
  center: { textAlign: 'center' },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  tipText: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
  dotActive: { width: DOT_ACTIVE },
  actions: { flexDirection: 'row', gap: spacing.sm },
  next: { flex: 1 },
});
