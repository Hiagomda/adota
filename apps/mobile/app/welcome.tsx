import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mascot, type MascotPose } from '../src/mascot';
import { useSession } from '../src/session';
import { palette, screenColumn, useTheme } from '../src/theme';

const steps: { pose: MascotPose; title: string; body: string }[] = [
  {
    pose: 'wave',
    title: 'Égua, adota!',
    body: 'Oi. Eu sou o mascote. Esta rede é de Belém: a gente encontra, resgata e acolhe animais de rua.',
  },
  {
    pose: 'search',
    title: 'Acha e publica',
    body: 'Viu um animal? Tira a foto, marca o lugar e publica. O mapa mostra o que está perto. A localização que os outros veem fica aproximada.',
  },
  {
    pose: 'drive',
    title: 'Alguém vai ajudar',
    body: 'Quem puder toca em Eu vou ajudar e vai até o animal. O resgate segue: a caminho, e depois resgatado.',
  },
  {
    pose: 'home',
    title: 'Até ter um lar',
    body: 'Depois vem o lar temporário e a adoção. O final feliz é o que a rede comemora.',
  },
];

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const finishWelcome = useSession((state) => state.finishWelcome);
  const [step, setStep] = useState(0);
  const current = steps[step] ?? steps[0];
  const last = step === steps.length - 1;

  function next() {
    if (!last) {
      setStep((value) => value + 1);
      return;
    }
    void finishWelcome().then(() => router.replace('/permissions'));
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.hero}>
        <Mascot pose={current.pose} size={260} label="Mascote do Égua, adota!" />
      </View>
      <View style={styles.column}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {current.title}
        </Text>
        <Text style={[styles.body, { color: theme.text }]}>{current.body}</Text>
        <View style={styles.dots} accessibilityLabel={`Passo ${step + 1} de ${steps.length}`}>
          {steps.map((item, index) => (
            <View
              key={item.pose}
              style={[styles.dot, { backgroundColor: index === step ? palette.caju : theme.line }]}
            />
          ))}
        </View>
        <Pressable accessibilityRole="button" style={styles.button} onPress={next}>
          <Text style={styles.buttonText}>{last ? 'Começar' : 'Próximo'}</Text>
        </Pressable>
        {step > 0 ? (
          <Pressable accessibilityRole="button" style={styles.back} onPress={() => setStep((value) => value - 1)}>
            <Text style={{ color: theme.muted, fontSize: 16 }}>Voltar</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  column: { ...screenColumn, padding: 24, gap: 16, paddingBottom: 24 },
  title: { fontSize: 32, fontWeight: '700' },
  body: { fontSize: 17, lineHeight: 25 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: palette.acai, fontSize: 17, fontWeight: '700' },
  back: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
