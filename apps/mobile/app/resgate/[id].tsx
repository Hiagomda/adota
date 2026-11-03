import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { animalHeadline, placeOf, sizeLabel, speciesLabel } from '../../src/animalLabels';
import { api, loadPost, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Card,
  Header,
  Icon,
  InfoChip,
  Input,
  Notice,
  Photo,
  useToast,
} from '../../src/components/ui';
import { useWhatsAppContact } from '../../src/contact/useWhatsAppContact';
import { logBestEffort } from '../../src/crash/bestEffort';
import {
  currentStep,
  finishOutcome,
  mapsUrl,
  operationSteps,
  stepIndex,
  teamLine,
  type OperationOutcome,
  type OperationPage,
} from '../../src/operation/operation';
import { statusChoices, type StatusChoice } from '../../src/post/statusChoices';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const SUMMARY_MAX = 400;

/**
 * Modo de operação do resgate: uma tela só com o que importa para quem está indo (o animal, o
 * ponto exato, o contato de quem publicou) e os passos na ordem. Retoma de onde a pessoa parou.
 */
export default function RescueOperationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [pending, setPending] = useState<OperationOutcome | null>(null);
  const [foundOpen, setFoundOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const whatsapp = useWhatsAppContact(token, setMessage);

  const post = useQuery({
    queryKey: ['post', id, token],
    queryFn: () => loadPost(id, token),
    enabled: Boolean(id),
  });
  const operation = useQuery({
    queryKey: ['operation', id, token],
    queryFn: () => api<OperationPage>(`/posts/${id}/operation`, { token }),
    enabled: Boolean(id && token),
  });

  const item = post.data;
  const page = operation.data;
  if (!token) {
    return (
      <Shell onBack={() => router.back()}>
        <Notice tone="info" message="Entre na sua conta para usar o modo resgate." />
      </Shell>
    );
  }
  if (post.isLoading || operation.isLoading) {
    return (
      <Shell onBack={() => router.back()}>
        <ActivityIndicator color={colors.primary} />
      </Shell>
    );
  }
  if (!item || !page) {
    return (
      <Shell onBack={() => router.back()}>
        <Notice
          tone="warning"
          message={`Não consegui abrir o resgate. ${messageFrom(post.error ?? operation.error)}`}
          action={{
            label: 'Tentar de novo',
            onPress: () => {
              void post.refetch();
              void operation.refetch();
            },
          }}
        />
      </Shell>
    );
  }

  const step = currentStep(page, pending);
  const index = stepIndex(step);
  const outcome = finishOutcome(page, pending);
  const team = teamLine(page.team);
  const choices = statusChoices('on_the_way', page.isAuthor, item.type);
  const animal = animalHeadline(item.animal);
  const authorFirst = item.author.name.split(' ')[0] ?? item.author.name;
  const animalRef =
    item.animal.name?.trim() ||
    `um ${(speciesLabel[item.animal.species] ?? 'bichinho').toLowerCase()}`;

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['operation', id] });
    await client.invalidateQueries({ queryKey: ['post', id, token] });
    await client.invalidateQueries({ queryKey: ['rescue-plan', id] });
    await client.invalidateQueries({ queryKey: ['posts'] });
    await client.invalidateQueries({ queryKey: ['map'] });
  }

  async function run(key: string, work: () => Promise<unknown>, done?: string) {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    try {
      await work();
      await refresh();
      Haptics.selectionAsync().catch(logBestEffort('operation:haptic'));
      if (done) toast.show(done, 'success');
    } catch (failure) {
      setMessage(messageFrom(failure));
    } finally {
      setBusy(null);
    }
  }

  const stepPost = (name: string, body?: unknown) =>
    api(`/posts/${id}/operation/${name}`, { method: 'POST', token, body });

  function chooseFound(choice: StatusChoice) {
    void run(
      `found:${choice.status}`,
      () => api(`/posts/${id}/status`, { method: 'PATCH', token, body: { status: choice.status } }),
      'Égua, que alegria! Agora conte como foi.',
    );
  }

  function finish() {
    void run(
      'finish',
      async () => {
        await stepPost('finish', {
          outcome,
          ...(summary.trim() ? { summary: summary.trim() } : {}),
        });
        setPending(null);
        setSummary('');
      },
      'Atendimento registrado. Obrigado por ajudar!',
    );
  }

  const exact = item.location.exact;
  const place = [item.addressText, item.referencePoint].filter(Boolean).join(' · ');

  return (
    <Shell onBack={() => router.back()} subtitle={placeOf(item.approxLabel)}>
      {!page.canOperate && step !== 'done' ? (
        <Notice
          tone="info"
          message={
            page.willHelp
              ? 'O animal já saiu da rua. Veja o resgate para os próximos passos.'
              : 'Toque em "Eu vou ajudar" no resgate para entrar no modo resgate.'
          }
          action={{ label: 'Ver o resgate', onPress: () => router.replace(`/post/${id}`) }}
        />
      ) : null}

      <Card padding="none" elevation="sm">
        <View style={styles.animal}>
          <Photo
            uri={item.media[0]?.thumbUrl ?? null}
            style={styles.thumb}
            accessibilityLabel={`Foto de ${animal}`}
          />
          <View style={styles.animalText}>
            <AppText variant="bodyStrong">{animal}</AppText>
            <AppText variant="bodySmall" color="textSecondary">
              {[sizeLabel[item.animal.size], item.urgency === 'high' ? 'Urgente' : null]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
            {item.animal.healthNotes ? (
              <AppText variant="bodySmall">Saúde: {item.animal.healthNotes}</AppText>
            ) : null}
            {item.animal.temperament ? (
              <AppText variant="bodySmall">Jeito: {item.animal.temperament}</AppText>
            ) : null}
          </View>
        </View>
      </Card>

      <Card elevation="sm">
        <View style={styles.block}>
          <View style={styles.inline}>
            <Icon name="map-pin" size="sm" color={colors.primary} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {exact ? 'Ponto exato liberado' : placeOf(item.approxLabel)}
            </AppText>
          </View>
          {place ? (
            <AppText variant="bodySmall" color="textSecondary">
              {place}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button
              title="Abrir no mapa"
              icon="navigation"
              variant="outline"
              onPress={() =>
                void Linking.openURL(mapsUrl(item.location.latitude, item.location.longitude))
              }
            />
            {!page.isAuthor ? (
              <Button
                title={`Falar com ${authorFirst}`}
                icon="message-circle"
                variant="outline"
                loading={whatsapp.busy === `/posts/${id}/contact`}
                onPress={() =>
                  void whatsapp.open(
                    `/posts/${id}/contact`,
                    `Oi, ${authorFirst}! Estou no resgate de ${animalRef} em ${placeOf(item.approxLabel)}, pelo Égua, adota!.`,
                  )
                }
              />
            ) : null}
          </View>
          {team ? (
            <AppText variant="bodySmall" color="textSecondary">
              Também neste resgate: {team}
            </AppText>
          ) : null}
        </View>
      </Card>

      <View style={styles.steps}>
        {operationSteps.map((entry, position) => {
          const done = position < index;
          const now = position === index;
          return (
            <View key={entry.value} style={styles.step}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: done
                      ? colors.success
                      : now
                        ? colors.primary
                        : colors.surfaceMuted,
                  },
                ]}
              >
                {done ? (
                  <Icon name="check" size="sm" color={colors.onPrimary} />
                ) : (
                  <AppText
                    variant="bodySmallStrong"
                    style={{ color: now ? colors.onPrimary : colors.textSecondary }}
                  >
                    {position + 1}
                  </AppText>
                )}
              </View>
              <View style={styles.stepBody}>
                <AppText
                  variant={now ? 'bodyStrong' : 'body'}
                  color={now || done ? 'text' : 'textSecondary'}
                >
                  {entry.title}
                </AppText>
                {now && page.canOperate && entry.value === 'depart' ? (
                  <Button
                    title="Estou saindo agora"
                    icon="navigation"
                    size="lg"
                    fullWidth
                    loading={busy === 'depart'}
                    onPress={() =>
                      void run('depart', () => stepPost('departed'), 'Avisamos quem publicou.')
                    }
                  />
                ) : null}
                {now && page.canOperate && entry.value === 'arrive' ? (
                  <Button
                    title="Já cheguei"
                    icon="map-pin"
                    size="lg"
                    fullWidth
                    loading={busy === 'arrive'}
                    onPress={() =>
                      void run('arrive', () => stepPost('arrived'), 'Chegada anotada no diário.')
                    }
                  />
                ) : null}
                {now && page.canOperate && entry.value === 'found' ? (
                  <View style={styles.choices}>
                    {foundOpen ? (
                      <>
                        <AppText variant="bodySmall" color="textSecondary">
                          Como ele está agora?
                        </AppText>
                        {choices.map((choice) => (
                          <Button
                            key={choice.status}
                            title={choice.title}
                            icon={choice.icon}
                            variant="outline"
                            size="lg"
                            fullWidth
                            loading={busy === `found:${choice.status}`}
                            disabled={busy !== null}
                            onPress={() => chooseFound(choice)}
                          />
                        ))}
                      </>
                    ) : (
                      <Button
                        title="Sim, encontrei"
                        icon="check"
                        variant="secondary"
                        size="lg"
                        fullWidth
                        disabled={busy !== null}
                        onPress={() => setFoundOpen(true)}
                      />
                    )}
                    <Button
                      title="Não encontrei"
                      icon="search"
                      variant="outline"
                      size="lg"
                      fullWidth
                      disabled={busy !== null}
                      onPress={() => setPending('not_found')}
                    />
                    <Button
                      title="Não deu para continuar"
                      variant="ghost"
                      fullWidth
                      disabled={busy !== null}
                      onPress={() => setPending('could_not')}
                    />
                  </View>
                ) : null}
                {now && entry.value === 'summary' ? (
                  <View style={styles.choices}>
                    <InfoChip
                      label={
                        outcome === 'found'
                          ? 'Animal encontrado'
                          : outcome === 'not_found'
                            ? 'Não encontrado'
                            : 'Não deu para continuar'
                      }
                      tone={outcome === 'found' ? 'success' : 'neutral'}
                    />
                    <Input
                      label="Como foi? (se quiser)"
                      placeholder={
                        outcome === 'found'
                          ? 'Ex.: estava com a pata machucada, levei para casa'
                          : 'Ex.: procurei na praça e na rua de trás'
                      }
                      value={summary}
                      onChangeText={setSummary}
                      multiline
                      maxLength={SUMMARY_MAX}
                      helper={`${summary.length}/${SUMMARY_MAX}. Vai para o diário do resgate. Não coloque telefone nem endereço.`}
                    />
                    <Button
                      title="Finalizar atendimento"
                      icon="check-circle"
                      size="lg"
                      fullWidth
                      loading={busy === 'finish'}
                      onPress={finish}
                    />
                    {pending ? (
                      <Button
                        title="Voltar"
                        variant="ghost"
                        fullWidth
                        disabled={busy !== null}
                        onPress={() => setPending(null)}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {message ? <Notice tone="error" message={message} /> : null}

      {step === 'done' ? (
        <Notice
          tone="success"
          message="Atendimento registrado. O resumo está no diário do resgate."
          action={{ label: 'Ver o resgate', onPress: () => router.replace(`/post/${id}`) }}
        />
      ) : null}
    </Shell>
  );
}

function Shell({
  children,
  onBack,
  subtitle,
}: {
  children: React.ReactNode;
  onBack: () => void;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header title="Modo resgate" subtitle={subtitle} onBack={onBack} />
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  animal: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  animalText: { flex: 1, gap: spacing.xs },
  block: { gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  steps: { gap: spacing.lg },
  step: { flexDirection: 'row', gap: spacing.md },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBody: { flex: 1, gap: spacing.sm, paddingTop: spacing.xs },
  choices: { gap: spacing.sm },
});

// Uma tela quebrada não derruba o app.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
