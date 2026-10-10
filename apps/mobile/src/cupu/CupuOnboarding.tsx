import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { AppText, Button } from '../components/ui';
import { useSession } from '../session';
import { motion, radius, spacing, useMotionDuration, useTheme } from '../theme';
import { vocativeFromName } from '../vocative';
import { hasSeenCupuOnboarding, markCupuOnboardingSeen } from './onboardingStorage';

const steps: {
  image: ImageSourcePropType;
  title: string;
  description: string;
  button: string;
}[] = [
  {
    image: require('../../assets/images/cupu-welcome.png'),
    title: 'Ei, mano(a)! Que bom te ver por aqui!',
    description:
      'Boas-vindas ao Égua, adota! 🐾\n\nEu sou o Cupuaçu, mas pode me chamar de Cupu! Vou te guiar pra tu saberes como ajudar os bichinhos da nossa terra.',
    button: 'Prazer, Cupu!',
  },
  {
    image: require('../../assets/images/cupu-scout.png'),
    title: 'Olha o que tu podes fazer:',
    description:
      'Podes cadastrar pets pra adoção, oferecer lar temporário ou sinalizar no mapa se vires algum animalzinho precisando de resgate.',
    button: 'E como ganho selos?',
  },
  {
    image: require('../../assets/images/cupu-happy.png'),
    title: 'Ajuda e ganha XP!',
    description:
      'A cada boa ação concluída, tu ganhas pontos, sobes de nível e liberas selos como Herói Local.',
    button: 'Bora lá, Cupu!',
  },
];

const CARD_MAX_WIDTH = 360;
const MASCOT_WIDTH = 210;
const MASCOT_HEIGHT = 200;
const PLATE = 230;
const MASCOT_OVERLAP = 92;
const CARD_TOP_SPACE = 96;
const PAGES_MIN_HEIGHT = 168;
const DOT = 8;

export default function CupuOnboarding() {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const { width } = useWindowDimensions();
  const ready = useSession((state) => state.ready);
  const cupuPrompt = useSession((state) => state.cupuPrompt);
  const clearCupuPrompt = useSession((state) => state.clearCupuPrompt);
  const userName = useSession((state) => state.user?.name);
  const pages = useMemo(
    () =>
      steps.map((item, itemIndex) =>
        itemIndex === 0
          ? { ...item, title: `Ei, ${vocativeFromName(userName)}! Que bom te ver por aqui!` }
          : item,
      ),
    [userName],
  );
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const cardWidth = Math.min(width - spacing.xxl * 2, CARD_MAX_WIDTH);
  const step = pages[index] ?? pages[0];

  useEffect(() => {
    if (!ready || !cupuPrompt) return;
    let cancelled = false;
    void hasSeenCupuOnboarding().then((seen) => {
      if (cancelled) return;
      if (!seen) setVisible(true);
      else clearCupuPrompt();
    });
    return () => {
      cancelled = true;
    };
  }, [clearCupuPrompt, cupuPrompt, ready]);

  async function advance() {
    if (index < pages.length - 1) {
      setIndex(index + 1);
      return;
    }
    await markCupuOnboardingSeen();
    setVisible(false);
    clearCupuPrompt();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.stack, { width: cardWidth }]}>
          <View style={styles.cupuWrap}>
            <View style={[styles.cupuPlate, { backgroundColor: colors.surfaceRaised }]} />
            <Image
              source={step.image}
              style={styles.cupu}
              resizeMode="contain"
              accessibilityLabel="Cupu, mascote do Égua, adota!"
            />
          </View>
          <View style={[styles.card, shadows.lg, { backgroundColor: colors.surfaceRaised }]}>
            <View
              style={styles.pages}
              onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
            >
              {pageWidth > 0 ? (
                <Animated.View
                  style={[
                    styles.track,
                    {
                      width: pageWidth * pages.length,
                      transform: [{ translateX: -index * pageWidth }],
                      transitionProperty: 'transform',
                      transitionDuration: duration(motion.slow),
                    },
                  ]}
                >
                  {pages.map((item) => (
                    <View key={item.button} style={[styles.page, { width: pageWidth }]}>
                      <AppText variant="h2" style={styles.center}>
                        {item.title}
                      </AppText>
                      <AppText color="textSecondary" style={styles.center}>
                        {item.description}
                      </AppText>
                    </View>
                  ))}
                </Animated.View>
              ) : null}
            </View>
            <View
              accessible
              accessibilityLabel={`Passo ${index + 1} de ${pages.length}`}
              style={styles.dots}
            >
              {pages.map((item, dot) => (
                <View
                  key={item.button}
                  style={[
                    styles.dot,
                    { backgroundColor: dot === index ? colors.secondary : colors.border },
                  ]}
                />
              ))}
            </View>
            <Button
              title={step.button}
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => void advance()}
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
    padding: spacing.xxl,
  },
  stack: { alignItems: 'center' },
  cupuWrap: {
    width: MASCOT_WIDTH,
    height: MASCOT_HEIGHT,
    marginBottom: -MASCOT_OVERLAP,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cupuPlate: {
    position: 'absolute',
    width: PLATE,
    height: PLATE,
    borderRadius: radius.pill,
    top: -spacing.giant,
  },
  cupu: { width: MASCOT_WIDTH, height: MASCOT_HEIGHT },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    paddingTop: CARD_TOP_SPACE,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  pages: { minHeight: PAGES_MIN_HEIGHT, overflow: 'hidden' },
  track: { flexDirection: 'row' },
  page: { gap: spacing.sm },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
});
