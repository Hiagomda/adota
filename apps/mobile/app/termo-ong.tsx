import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fieldHelp, ORG_TERM_MAX, ORG_TERM_MIN, type OrgTerm } from '../src/adoptionTerm/term';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  Header,
  Input,
  Notice,
  Segmented,
  Switch,
  useToast,
} from '../src/components/ui';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

type Choice = 'app' | 'own';

/**
 * Termo de adoção da ONG. Sem termo próprio, quem adota um animal da ONG aceita o termo do app.
 * Com termo próprio, vale o texto da ONG, com os campos {adotante}, {animal}, {quem_entrega} e
 * {data} trocados na hora. A ONG pode pedir CPF e endereço no aceite. Mudar o termo não muda o
 * que já foi aceito.
 */
export default function OrgTermScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [choice, setChoice] = useState<Choice>('app');
  const [body, setBody] = useState('');
  const [requireIdentity, setRequireIdentity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const query = useQuery({
    queryKey: ['org-term', token],
    queryFn: () => api<OrgTerm>('/me/adoption-term', { token }),
    enabled: Boolean(token),
  });
  const data = query.data;

  useEffect(() => {
    if (!data) return;
    setChoice(data.body ? 'own' : 'app');
    setBody(data.body ?? data.appTemplate);
    setRequireIdentity(data.requireIdentity);
  }, [data]);

  const length = body.trim().length;
  const tooShort = length < ORG_TERM_MIN;

  async function save(next: { body: string | null; requireIdentity: boolean }, done: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/me/adoption-term', { method: 'PUT', token, body: next });
      await client.invalidateQueries({ queryKey: ['org-term'] });
      toast.show(done, 'success');
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setBusy(false);
    }
  }

  function onChoice(next: Choice) {
    setChoice(next);
    setError(null);
    // Voltar para o termo do app apaga o próprio: pede confirmação se havia um salvo.
    if (next === 'app' && data?.body) setConfirmReset(true);
  }

  let content: React.ReactNode;
  if (!token) {
    content = <Notice tone="info" message="Entre na sua conta para editar o termo." />;
  } else if (query.isLoading) {
    content = <ActivityIndicator color={colors.primary} />;
  } else if (query.isError || !data) {
    content = (
      <Notice
        tone="warning"
        message={`Não consegui abrir o termo. ${messageFrom(query.error)}`}
        action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }}
      />
    );
  } else {
    content = (
      <>
        <AppText color="textSecondary">
          Quem adota um animal seu lê e aceita este termo no app, com o nome completo. O texto
          aceito fica guardado do jeito que foi lido, e você recebe um aviso.
        </AppText>
        <Segmented<Choice>
          options={[
            { value: 'app', label: 'Termo do app' },
            { value: 'own', label: 'Meu termo' },
          ]}
          value={choice}
          onChange={onChoice}
          accessibilityLabel="Qual termo vale"
        />

        {choice === 'app' ? (
          <>
            <Notice
              tone="info"
              message="O termo do app segue o modelo usado pelas ONGs e muda conforme o animal: castração só se ainda não for castrado, telas para gatos e nada de corrente para cães."
            />
            <Card elevation="sm">
              <AppText selectable style={styles.term}>
                {data.appTemplate}
              </AppText>
            </Card>
          </>
        ) : (
          <>
            <Notice
              tone="info"
              message={`Escreva ou cole o termo da sua ONG. O app troca estes campos na hora:\n${fieldHelp(data.fields)}`}
            />
            <Input
              label="Texto do termo"
              value={body}
              onChangeText={(text) => setBody(text.slice(0, ORG_TERM_MAX))}
              multiline
              maxLength={ORG_TERM_MAX}
              helper={`${length}/${ORG_TERM_MAX}${tooShort ? `. Mínimo de ${ORG_TERM_MIN} letras.` : ''}`}
            />
            <Button
              title="Começar do termo do app"
              icon="copy"
              variant="ghost"
              onPress={() => setBody(data.appTemplate)}
            />
            <Switch
              label="Pedir CPF e endereço"
              description="Quem adota precisa informar para aceitar. Só você e a equipe veem."
              value={requireIdentity}
              onValueChange={setRequireIdentity}
            />
            {error ? <Notice tone="error" message={error} /> : null}
            <Button
              title="Salvar meu termo"
              icon="save"
              size="lg"
              fullWidth
              disabled={tooShort}
              loading={busy}
              onPress={() =>
                void save(
                  { body: body.trim(), requireIdentity },
                  'Termo salvo. Vale para as próximas adoções.',
                )
              }
            />
          </>
        )}
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header
            title="Termo de adoção"
            subtitle="Da sua ONG"
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/painel-ong'))}
          />
          <View style={styles.body}>{content}</View>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirmReset}
        title="Voltar para o termo do app?"
        message="O seu termo será apagado. O que já foi aceito continua guardado."
        confirmLabel="Usar o termo do app"
        onConfirm={() => {
          setConfirmReset(false);
          void save({ body: null, requireIdentity: false }, 'Pronto. Vale o termo do app.');
        }}
        onCancel={() => {
          setConfirmReset(false);
          setChoice('own');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  term: { lineHeight: 22 },
});

// Uma tela quebrada não derruba o app.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
