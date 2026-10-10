import { Redirect, useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestGoogleIdToken } from '../src/auth/googleNative';
import { GoogleButton } from '../src/components/auth/GoogleButton';
import { AppText, Button, HeroSurface, Notice, Touchable } from '../src/components/ui';
import { Mascot } from '../src/mascot';
import { useSession } from '../src/session';
import {
  motion,
  radius,
  screenColumn,
  size,
  spacing,
  useMotionDuration,
  useTheme,
} from '../src/theme';

const MASCOT = 168;

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const duration = useMotionDuration();
  const token = useSession((state) => state.token);
  const permissionsSeen = useSession((state) => state.permissionsSeen);
  const signedOutReason = useSession((state) => state.signedOutReason);
  const clearSignedOutReason = useSession((state) => state.clearSignedOutReason);
  const signInWithGoogle = useSession((state) => state.signInWithGoogle);
  const [notice, setNotice] = useState<string | null>(null);
  const openingGoogle = useRef(false);

  function continueWithGoogle() {
    if (openingGoogle.current) return;
    openingGoogle.current = true;
    setNotice(null);
    void requestGoogleIdToken()
      .then(async (idToken) => {
        if (!idToken) return;
        await signInWithGoogle(idToken);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        setNotice(message || 'Não consegui entrar com o Google. Tente de novo.');
      })
      .finally(() => {
        openingGoogle.current = false;
      });
  }

  if (token) return <Redirect href={permissionsSeen ? '/(tabs)' : '/permissions'} />;

  function enterApp() {
    clearSignedOutReason();
    router.replace(permissionsSeen ? '/(tabs)' : '/permissions');
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <HeroSurface style={styles.hero}>
        <SafeAreaView edges={['top']} style={styles.heroInner}>
          <Mascot pose="wave" size={MASCOT} label="Mascote do Égua, adota!" />
          <AppText variant="display" style={{ color: colors.onHero }}>
            Égua, adota!
          </AppText>
          <AppText variant="body" style={[styles.pitch, { color: colors.onHeroMuted }]}>
            Alguém achou um animal na rua. Você pode ser quem ajuda.
          </AppText>
        </SafeAreaView>
      </HeroSurface>
      <Animated.View
        entering={FadeInDown.duration(duration(motion.base))}
        style={[styles.sheet, { backgroundColor: colors.surface }]}
      >
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.column}>
            {signedOutReason ? <Notice message={signedOutReason} tone="warning" /> : null}
            {notice ? <Notice message={notice} tone="info" /> : null}
            <GoogleButton onPress={continueWithGoogle} />
            <Button
              title="Entrar com e-mail"
              icon="mail"
              size="lg"
              fullWidth
              onPress={() => {
                clearSignedOutReason();
                router.push('/login');
              }}
            />
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Criar conta"
              onPress={() => router.push('/signup' as Href)}
              style={styles.linkHit}
            >
              <AppText variant="button" color="primary">
                Criar conta
              </AppText>
            </Touchable>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Explorar sem conta"
              onPress={enterApp}
              style={styles.linkHit}
            >
              <AppText variant="body" color="textSecondary">
                Explorar sem conta
              </AppText>
            </Touchable>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { minHeight: 360 },
  heroInner: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: size.curve + spacing.xl,
    gap: spacing.sm,
  },
  pitch: { textAlign: 'center', maxWidth: 320 },
  sheet: {
    flex: 1,
    marginTop: -size.curve,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  sheetContent: { flexGrow: 1, padding: spacing.xl, paddingBottom: spacing.giant },
  column: { ...screenColumn, width: '100%', gap: spacing.md },
  linkHit: { minHeight: size.touch, alignItems: 'center', justifyContent: 'center' },
});

export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
