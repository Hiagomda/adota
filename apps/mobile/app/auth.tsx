import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthError } from '../src/auth/errors';
import { googleIdTokenFromUrl } from '../src/auth/google';
import { AppText, Button } from '../src/components/ui';
import { useSession } from '../src/session';
import { spacing, useTheme } from '../src/theme';

export default function GoogleAuthScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id_token?: string | string[] }>();
  const raw = Array.isArray(params.id_token) ? params.id_token[0] : params.id_token;
  const idToken = raw ? googleIdTokenFromUrl(`egua://auth?id_token=${raw}`) : null;
  const token = useSession((state) => state.token);
  const permissionsSeen = useSession((state) => state.permissionsSeen);
  const signInWithGoogle = useSession((state) => state.signInWithGoogle);
  const started = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);
  const message = failed ?? (idToken ? null : 'Não consegui entrar com o Google. Tente de novo.');

  useEffect(() => {
    if (token || !idToken || started.current) return;
    started.current = true;
    void signInWithGoogle(idToken).catch((error: unknown) => {
      setFailed(
        error instanceof AuthError
          ? error.message
          : 'Não consegui entrar com o Google. Tente de novo.',
      );
    });
  }, [idToken, signInWithGoogle, token]);

  if (token) return <Redirect href={permissionsSeen ? '/(tabs)' : '/permissions'} />;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {message ? (
        <>
          <AppText variant="body" style={styles.message}>
            {message}
          </AppText>
          <Button title="Voltar" onPress={() => router.replace('/welcome' as Href)} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="body" color="textSecondary">
            Entrando com o Google…
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  message: { textAlign: 'center' },
});

export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
