import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { messageFrom } from '../src/api';
import { continueAfterAuth } from '../src/auth/continue';
import { AuthError } from '../src/auth/errors';
import { safeReturnTo } from '../src/auth/returnTo';
import { useSubmitLock } from '../src/auth/useSubmitLock';
import {
  confirmPasswordError,
  emailError,
  nameError,
  normalizeEmail,
  passwordError,
} from '../src/auth/validation';
import { AuthForm } from '../src/components/auth/AuthForm';
import { PasswordStrengthBar } from '../src/components/auth/PasswordStrength';
import { AppText, Button, Checkbox, FloatingField, Touchable } from '../src/components/ui';
import { useSession } from '../src/session';
import { size, spacing } from '../src/theme';

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = safeReturnTo(params.returnTo);
  const token = useSession((state) => state.token);
  const permissionsSeen = useSession((state) => state.permissionsSeen);
  const signUp = useSession((state) => state.signUp);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const { pending, run } = useSubmitLock();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    password: false,
    confirm: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  if (token && !created) return <Redirect href={(returnTo ?? '/(tabs)') as Href} />;

  const show = (field: keyof typeof touched, message: string | null) =>
    touched[field] || submitted ? message : null;

  function submit() {
    setSubmitted(true);
    setFormError(null);
    if (
      nameError(name) ||
      emailError(email) ||
      passwordError(password) ||
      confirmPasswordError(password, confirm)
    ) {
      return;
    }
    if (!accepted) {
      setFormError('Aceite os termos e a privacidade para criar a conta.');
      return;
    }
    void run(async () => {
      try {
        const verificationSent = await signUp(name, normalizeEmail(email), password);
        setCreated(
          verificationSent
            ? 'Conta criada. Enviamos um e-mail para você confirmar o endereço.'
            : 'Conta criada. Você já pode continuar.',
        );
      } catch (error) {
        setFormError(error instanceof AuthError ? error.message : messageFrom(error));
      }
    });
  }

  if (created) {
    return (
      <AuthForm title="Conta criada" subtitle={created} notice={null} onBack={() => router.back()}>
        <Button
          title="Começar"
          size="lg"
          fullWidth
          onPress={() => continueAfterAuth(router, permissionsSeen, returnTo)}
        />
      </AuthForm>
    );
  }

  return (
    <AuthForm
      title="Criar conta"
      subtitle="Leva um minuto. Depois você já pode publicar um resgate."
      notice={formError}
      onBack={() => router.back()}
    >
      <FloatingField
        label="Nome"
        icon="user"
        value={name}
        error={show('name', nameError(name)) ?? undefined}
        onChangeText={setName}
        onBlur={() => setTouched((current) => ({ ...current, name: true }))}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <FloatingField
        ref={emailRef}
        label="E-mail"
        icon="mail"
        value={email}
        error={show('email', emailError(email)) ?? undefined}
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
        error={show('password', passwordError(password)) ?? undefined}
        onChangeText={setPassword}
        onBlur={() => setTouched((current) => ({ ...current, password: true }))}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <PasswordStrengthBar password={password} />
      <FloatingField
        ref={confirmRef}
        label="Confirmar senha"
        icon="lock"
        secret
        revealed={showPassword}
        onToggleSecret={() => setShowPassword((current) => !current)}
        value={confirm}
        error={show('confirm', confirmPasswordError(password, confirm)) ?? undefined}
        onChangeText={setConfirm}
        onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Checkbox
        label="Li e aceito os Termos de Uso e a Política de Privacidade."
        checked={accepted}
        onChange={setAccepted}
      />
      <Touchable
        accessibilityRole="link"
        accessibilityLabel="Ler os termos e a privacidade"
        onPress={() => router.push('/legal')}
        style={{ minHeight: size.touch, justifyContent: 'center' }}
      >
        <AppText variant="button" color="primary">
          Ler os termos e a privacidade
        </AppText>
      </Touchable>
      {!accepted ? (
        <AppText variant="bodySmall" color="errorText">
          Aceite os termos para criar a conta.
        </AppText>
      ) : null}
      <View style={{ marginTop: spacing.sm }}>
        <Button
          title="Criar conta"
          size="lg"
          fullWidth
          loading={pending}
          disabled={!accepted}
          onPress={submit}
        />
      </View>
    </AuthForm>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
