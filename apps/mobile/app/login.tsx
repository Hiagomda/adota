import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { messageFrom } from '../src/api';
import { continueAfterAuth } from '../src/auth/continue';
import { AuthError } from '../src/auth/errors';
import { safeReturnTo } from '../src/auth/returnTo';
import { useSubmitLock } from '../src/auth/useSubmitLock';
import { emailError, normalizeEmail, passwordError } from '../src/auth/validation';
import { AuthForm } from '../src/components/auth/AuthForm';
import { AppText, Button, FloatingField, Touchable } from '../src/components/ui';
import { useSession } from '../src/session';
import { size } from '../src/theme';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = safeReturnTo(params.returnTo);
  const token = useSession((state) => state.token);
  const permissionsSeen = useSession((state) => state.permissionsSeen);
  const signIn = useSession((state) => state.signIn);
  const passwordRef = useRef<TextInput>(null);
  const { pending, run } = useSubmitLock();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [formError, setFormError] = useState<string | null>(null);

  if (token) return <Redirect href={(returnTo ?? '/(tabs)') as Href} />;

  const emailMessage = touched.email || submitted ? emailError(email) : null;
  const passwordMessage = touched.password || submitted ? passwordError(password) : null;

  function submit() {
    setSubmitted(true);
    setFormError(null);
    if (emailError(email) || passwordError(password)) return;
    void run(async () => {
      try {
        await signIn(normalizeEmail(email), password);
        continueAfterAuth(router, permissionsSeen, returnTo);
      } catch (error) {
        setFormError(error instanceof AuthError ? error.message : messageFrom(error));
      }
    });
  }

  return (
    <AuthForm
      title="Entrar"
      subtitle="Use o e-mail da sua conta para continuar de onde parou."
      notice={formError}
      onBack={() => router.back()}
    >
      <FloatingField
        label="E-mail"
        icon="mail"
        value={email}
        error={emailMessage ?? undefined}
        onChangeText={setEmail}
        onBlur={() => setTouched((current) => ({ ...current, email: true }))}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        inputMode="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <FloatingField
        ref={passwordRef}
        label="Senha"
        icon="lock"
        secret
        revealed={showPassword}
        onToggleSecret={() => setShowPassword((current) => !current)}
        value={password}
        error={passwordMessage ?? undefined}
        onChangeText={setPassword}
        onBlur={() => setTouched((current) => ({ ...current, password: true }))}
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Touchable
        accessibilityRole="button"
        accessibilityLabel="Esqueci minha senha"
        onPress={() => router.push('/recuperar-senha' as Href)}
        style={{ minHeight: size.touch, justifyContent: 'center' }}
      >
        <AppText variant="button" color="primary">
          Esqueci minha senha
        </AppText>
      </Touchable>
      <Button title="Entrar" size="lg" fullWidth loading={pending} onPress={submit} />
      <View style={{ minHeight: size.touch, alignItems: 'center', justifyContent: 'center' }}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Criar conta"
          onPress={() =>
            router.push(
              (returnTo ? `/signup?returnTo=${encodeURIComponent(returnTo)}` : '/signup') as Href,
            )
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AppText color="textSecondary">Não tem conta? </AppText>
            <AppText variant="button" color="primary">
              Criar conta
            </AppText>
          </View>
        </Touchable>
      </View>
    </AuthForm>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
