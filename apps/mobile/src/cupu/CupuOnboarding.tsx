import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSession } from '../session';
import { palette } from '../theme';
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
      'Podes cadastrar pets pra adoção, oferecer lar temporário, dar aquela carona solidária ou sinalizar no mapa se vires algum animalzinho precisando de resgate.',
    button: 'E como ganho selos?',
  },
  {
    image: require('../../assets/images/cupu-happy.png'),
    title: 'Ajuda e ganha XP!',
    description:
      'A cada boa ação concluída, tu ganhas pontos, sobes de nível e liberas selos bonitões como Herói Local e Piloto do Bem!',
    button: 'Bora lá, Cupu!',
  },
];

export default function CupuOnboarding() {
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
  const cardWidth = Math.min(width - 48, 360);
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
      <View style={styles.backdrop}>
        <View style={[styles.stack, { width: cardWidth }]}>
          <View style={styles.cupuWrap}>
            <View style={styles.cupuPlate} />
            <Image
              source={step.image}
              style={styles.cupu}
              resizeMode="contain"
              accessibilityLabel="Cupu, mascote do Égua, adota!"
            />
          </View>
          <View style={styles.card}>
            <View
              style={styles.pages}
              onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}
            >
              {pageWidth > 0 ? (
                <View style={[styles.track, { width: pageWidth * pages.length, transform: [{ translateX: -index * pageWidth }] }]}>
                  {pages.map((item) => (
                    <View key={item.button} style={[styles.page, { width: pageWidth }]}>
                      <Text style={styles.title}>{item.title}</Text>
                      <Text style={styles.body}>{item.description}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={styles.dots} accessibilityLabel={`Passo ${index + 1} de ${pages.length}`}>
              {pages.map((item, dot) => (
                <View
                  key={item.button}
                  style={[styles.dot, dot === index ? styles.dotOn : null]}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => void advance()}
            >
              <Text style={styles.buttonText}>{step.button}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000080',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stack: { alignItems: 'center' },
  cupuWrap: {
    width: 210,
    height: 200,
    marginBottom: -92,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cupuPlate: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: palette.white,
    top: -46,
  },
  cupu: { width: 210, height: 200 },
  card: {
    width: '100%',
    backgroundColor: palette.white,
    borderRadius: 24,
    paddingTop: 96,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  pages: { minHeight: 168, overflow: 'hidden' },
  track: { flexDirection: 'row' },
  page: { gap: 8 },
  title: { color: palette.acai, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { color: '#4E6468', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E7E5E4' },
  dotOn: { backgroundColor: '#F59E0B' },
  button: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: palette.acai, fontSize: 17, fontWeight: '700' },
});
