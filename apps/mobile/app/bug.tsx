import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  BUG_MESSAGE_MAX,
  BUG_MESSAGE_MIN,
  bugReportBody,
  bugReportEmailText,
} from '../src/bugReport/bugReport';
import { BugIcon } from '../src/bugReport/BugIcon';
import { AppText, Button, Header, Input, Notice, useToast } from '../src/components/ui';
import { reportError } from '../src/crash/reporter';
import { Mascot } from '../src/mascot';
import { useSession } from '../src/session';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';

const SUPPORT_EMAIL = 'contato@eguaadota.com.br';

export default function BugReportScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const token = useSession((state) => state.token);
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = text.trim().length < BUG_MESSAGE_MIN;

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function send() {
    if (tooShort || sending) return;
    setSending(true);
    setError(null);
    try {
      await api('/bug-reports', {
        method: 'POST',
        token,
        body: bugReportBody(text, from ?? null),
      });
      toast.show('Valeu! O aviso chegou na equipe.', 'success');
      leave();
    } catch (sendError) {
      setError(messageFrom(sendError));
    } finally {
      setSending(false);
    }
  }

  function sendByEmail() {
    const body = bugReportEmailText(bugReportBody(text, from ?? null));
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      'Bug no Égua, adota!',
    )}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch((mailError: unknown) => {
      reportError(mailError, { source: 'handled', where: 'bug:mailto' });
      Clipboard.setStringAsync(`${SUPPORT_EMAIL}\n\n${body}`)
        .then(() => toast.show('Não achei um app de e-mail. Copiei o aviso para você.', 'info'))
        .catch((copyError: unknown) => {
          reportError(copyError, { source: 'handled', where: 'bug:copy' });
          toast.show(`Não achei um app de e-mail. Escreva para ${SUPPORT_EMAIL}.`, 'info');
        });
    });
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header title="Achou um bug?" onBack={leave} />
          <View style={styles.body}>
            <View style={[styles.art, { backgroundColor: colors.secondarySoft }]}>
              <Mascot pose="search" size={150} />
              <View style={[styles.badge, { backgroundColor: colors.surfaceRaised }]}>
                <BugIcon size={30} />
              </View>
            </View>
            <AppText style={styles.center} color="textSecondary">
              O app é novinho e está em pleno desenvolvimento. Conta pra gente o que aconteceu: o
              que tu tentaste fazer e o que deu errado. Cada aviso ajuda o Cupu a deixar tudo
              redondinho.
            </AppText>
            <Input
              label="O que aconteceu?"
              value={text}
              onChangeText={setText}
              placeholder="Ex.: toquei em Publicar e a tela ficou branca"
              maxLength={BUG_MESSAGE_MAX}
              multiline
              autoFocus
            />
            <AppText variant="caption" color="textSecondary">
              Vai junto: a versão do app, o modelo do celular e a tela em que tu estavas. Nada de
              localização ou fotos.
            </AppText>
            {error ? <Notice tone="error" message={error} /> : null}
            {token ? (
              <Button
                title="Mandar aviso"
                icon="send"
                variant="secondary"
                size="lg"
                loading={sending}
                disabled={tooShort}
                onPress={() => void send()}
              />
            ) : null}
            <Button
              title={token ? 'Prefiro mandar por e-mail' : 'Mandar por e-mail'}
              icon="mail"
              variant={token ? 'ghost' : 'secondary'}
              size="lg"
              disabled={tooShort}
              onPress={sendByEmail}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: { flex: 1, ...screenColumn },
  body: { gap: spacing.lg, padding: spacing.lg },
  art: {
    height: 170,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
