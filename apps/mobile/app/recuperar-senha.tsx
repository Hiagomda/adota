import { useRouter } from 'expo-router';
import { useState } from 'react';
import { messageFrom } from '../src/api';
import { AuthError } from '../src/auth/errors';
import { requestPasswordReset } from '../src/auth/service';
import { useSubmitLock } from '../src/auth/useSubmitLock';
import { emailError, normalizeEmail } from '../src/auth/validation';
import { AuthForm } from '../src/components/auth/AuthForm';
import { Button, FloatingField } from '../src/components/ui';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { pending, run } = useSubmitLock();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit() {
    setSubmitted(true);
    setFormError(null);
    if (emailError(email)) return;
    void run(async () => {
      try {
        await requestPasswordReset(normalizeEmail(email));
        setSent(true);
      } catch (error) {
        setFormError(error instanceof AuthError ? error.message : messageFrom(error));
      }
    });
  }

  if (sent) {
    return (
      <AuthForm
        title="Olhe seu e-mail"
        subtitle="Se existir uma conta com esse endereço, enviamos um link para criar uma senha nova."
        notice={null}
        noticeTone="success"
        onBack={() => router.back()}
      >
        <Button title="Voltar para entrar" size="lg" fullWidth onPress={() => router.replace('/login')} />
      </AuthForm>
    );
  }

  return (
    <AuthForm
      title="Recuperar senha"
      subtitle="Informe o e-mail da conta. Vamos enviar um link se ele estiver cadastrado."
      notice={formError}
      onBack={() => router.back()}
    >
      <FloatingField
        label="E-mail"
        icon="mail"
        value={email}
        error={submitted ? (emailError(email) ?? undefined) : undefined}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        inputMode="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Button title="Enviar link" size="lg" fullWidth loading={pending} onPress={submit} />
    </AuthForm>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
