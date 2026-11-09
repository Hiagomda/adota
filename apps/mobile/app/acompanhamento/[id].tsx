import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadPost, messageFrom } from '../../src/api';
import { animalHeadline } from '../../src/animalLabels';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  InfoChip,
  Input,
  Notice,
  Switch,
  useToast,
} from '../../src/components/ui';
import { useWhatsAppContact } from '../../src/contact/useWhatsAppContact';
import { termStatusLine, type AdoptionTermPage } from '../../src/adoptionTerm/term';
import { formatWhen } from '../../src/format';
import {
  dayTitle,
  moodLabel,
  moodOptions,
  needsAttention,
  pendingCheckin,
  type CheckinMood,
  type FollowupPage,
} from '../../src/followup/followup';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

const NOTE_MAX = 500;
const moodTone = { great: 'success', ok: 'info', hard: 'warning' } as const;

/**
 * Acompanhamento depois da adoção. O tutor conta aos 7, 30 e 90 dias como vai a adaptação; quem
 * cuidava vê as respostas e fala com o tutor pelo WhatsApp se ficar difícil. Quem publicou e
 * marcou Adotado indica aqui quem adotou, entre quem preencheu a ficha.
 */
export default function FollowupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [mood, setMood] = useState<CheckinMood | null>(null);
  const [note, setNote] = useState('');
  const [wantsHelp, setWantsHelp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const whatsapp = useWhatsAppContact(token, setMessage);

  const post = useQuery({
    queryKey: ['post', id, token],
    queryFn: () => loadPost(id, token),
    enabled: Boolean(id),
  });
  const query = useQuery({
    queryKey: ['followup', id, token],
    queryFn: () => api<FollowupPage>(`/posts/${id}/followup`, { token }),
    enabled: Boolean(id && token),
  });
  const page = query.data;
  const followup = page?.followup ?? null;
  const term = useQuery({
    queryKey: ['adoption-term', id, token],
    queryFn: () => api<AdoptionTermPage>(`/posts/${id}/adoption-term`, { token }),
    enabled: Boolean(id && token && followup),
  });
  const termLine = termStatusLine(term.data);
  const pending = pendingCheckin(page);
  const name = post.data ? animalHeadline(post.data.animal) : 'o animal';

  async function send(key: string, work: () => Promise<FollowupPage>, done: string) {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    try {
      const next = await work();
      client.setQueryData(['followup', id, token], next);
      toast.show(done, 'success');
    } catch (failure) {
      setMessage(messageFrom(failure));
    } finally {
      setBusy(null);
    }
  }

  function answer() {
    if (!followup || !pending || !mood) return;
    void send(
      'answer',
      async () => {
        const next = await api<FollowupPage>(
          `/adoption-followups/${followup.id}/checkins/${pending.day}`,
          {
            method: 'POST',
            token,
            body: { mood, wantsHelp, ...(note.trim() ? { note: note.trim() } : {}) },
          },
        );
        setMood(null);
        setNote('');
        setWantsHelp(false);
        return next;
      },
      mood === 'hard' || wantsHelp
        ? 'Avisamos quem cuidava. Vocês vão conversar pelo WhatsApp.'
        : 'Obrigado por contar!',
    );
  }

  function chooseAdopter(userId: string) {
    void send(
      `adopter:${userId}`,
      () => api<FollowupPage>(`/posts/${id}/adopter`, { method: 'POST', token, body: { userId } }),
      'Pronto. Vamos acompanhar a adaptação com o tutor.',
    );
  }

  let body: React.ReactNode;
  if (!token) {
    body = <Notice tone="info" message="Entre na sua conta para ver o acompanhamento." />;
  } else if (query.isLoading) {
    body = <ActivityIndicator color={colors.primary} />;
  } else if (query.isError || !page) {
    body = (
      <Notice
        tone="warning"
        message={`Não consegui abrir o acompanhamento. ${messageFrom(query.error)}`}
        action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }}
      />
    );
  } else {
    body = (
      <>
        {page.canSetAdopter ? (
          <View style={styles.section}>
            <AppText variant="h2">Quem adotou?</AppText>
            <AppText color="textSecondary">
              Escolha a pessoa para o app perguntar, aos 7, 30 e 90 dias, como {name} está. Se ficar
              difícil, você recebe o aviso para conversar antes de uma devolução.
            </AppText>
            {page.candidates.length === 0 ? (
              <Notice
                tone="info"
                message="Ninguém preencheu a ficha de adoção pelo app. O acompanhamento só funciona quando o tutor tem conta e preencheu a ficha."
              />
            ) : (
              <Card padding="none" elevation="sm">
                {page.candidates.map((person, index) => (
                  <View key={person.id}>
                    {index > 0 ? <Divider inset /> : null}
                    <View style={styles.row}>
                      <Avatar name={person.name} size="sm" />
                      <View style={styles.flex}>
                        <AppText variant="bodyStrong">{person.name}</AppText>
                        <AppText variant="bodySmall" color="textSecondary">
                          @{person.handle}
                        </AppText>
                      </View>
                      <Button
                        title="Foi essa pessoa"
                        variant="outline"
                        loading={busy === `adopter:${person.id}`}
                        disabled={busy !== null}
                        onPress={() => chooseAdopter(person.id)}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>
        ) : null}

        {!followup && !page.canSetAdopter ? (
          <EmptyState
            title="Sem acompanhamento"
            body="O acompanhamento começa quando o animal é adotado por alguém com conta no app."
            pose="home"
            compact
          />
        ) : null}

        {followup ? (
          <>
            {followup.closed ? (
              <Notice tone="info" message="Esse acompanhamento foi encerrado." />
            ) : null}
            {page.role !== 'tutor' && needsAttention(page) && !followup.closed ? (
              <Notice
                tone="warning"
                message={`${followup.tutor.name.split(' ')[0]} contou que a adaptação está difícil. Converse antes de uma devolução.`}
              />
            ) : null}

            {termLine && term.data ? (
              <Card elevation={term.data.canAccept ? 'md' : 'sm'}>
                <View style={styles.section}>
                  <View style={styles.checkinTop}>
                    <AppText variant="h2">Termo de adoção</AppText>
                    <InfoChip
                      label={term.data.accepted ? 'Aceito' : 'Falta aceitar'}
                      tone={term.data.accepted ? 'success' : 'warning'}
                    />
                  </View>
                  <AppText color="textSecondary">{termLine}</AppText>
                  <Button
                    title={term.data.canAccept ? 'Ler e aceitar o termo' : 'Ver o termo'}
                    icon="file-text"
                    variant={term.data.canAccept ? 'primary' : 'outline'}
                    fullWidth
                    onPress={() => router.push(`/termo/${id}`)}
                  />
                </View>
              </Card>
            ) : null}

            {pending ? (
              <Card elevation="md">
                <View style={styles.section}>
                  <AppText variant="h2">
                    {post.data?.animal.name?.trim()
                      ? `${dayTitle(pending.day)} com ${post.data.animal.name.trim()}`
                      : `${dayTitle(pending.day)} juntos`}
                  </AppText>
                  <AppText color="textSecondary">Como está a adaptação?</AppText>
                  <View style={styles.moods}>
                    {moodOptions.map((option) => (
                      <Button
                        key={option.value}
                        title={option.label}
                        icon={option.icon}
                        size="lg"
                        fullWidth
                        variant={mood === option.value ? 'primary' : 'outline'}
                        onPress={() => setMood(option.value)}
                      />
                    ))}
                  </View>
                  <Input
                    label="Quer contar mais? (se quiser)"
                    placeholder="Ex.: já dorme na caminha, ainda estranha a rua"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={NOTE_MAX}
                    helper={`${note.length}/${NOTE_MAX}. Só você, quem cuidava e a equipe veem.`}
                  />
                  <Switch
                    label="Quero orientação"
                    description="Quem cuidava recebe o aviso para falar com você."
                    value={wantsHelp}
                    onValueChange={setWantsHelp}
                  />
                  <Button
                    title="Enviar"
                    icon="send"
                    size="lg"
                    fullWidth
                    disabled={!mood}
                    loading={busy === 'answer'}
                    onPress={answer}
                  />
                </View>
              </Card>
            ) : null}

            <View style={styles.section}>
              <AppText variant="h2">Check-ins</AppText>
              <AppText color="textSecondary">
                {page.role === 'tutor'
                  ? `Adotado ${formatWhen(followup.adoptedAt)}`
                  : `${followup.tutor.name} adotou ${formatWhen(followup.adoptedAt)}`}
              </AppText>
              <Card padding="none" elevation="sm">
                {followup.checkins.map((item, index) => (
                  <View key={item.day}>
                    {index > 0 ? <Divider inset /> : null}
                    <View style={styles.checkin}>
                      <View style={styles.checkinTop}>
                        <AppText variant="bodyStrong">{dayTitle(item.day)}</AppText>
                        {item.mood ? (
                          <InfoChip label={moodLabel(item.mood)} tone={moodTone[item.mood]} />
                        ) : (
                          <InfoChip
                            label={
                              item.due
                                ? 'Esperando resposta'
                                : `Em ${new Date(item.dueAt).toLocaleDateString('pt-BR')}`
                            }
                            tone="neutral"
                          />
                        )}
                        {item.wantsHelp ? (
                          <InfoChip label="Pediu orientação" tone="warning" />
                        ) : null}
                      </View>
                      {item.note ? <AppText variant="bodySmall">{item.note}</AppText> : null}
                    </View>
                  </View>
                ))}
              </Card>
            </View>

            {page.role === 'tutor' ? (
              <Button
                title="Falar com quem cuidava"
                icon="message-circle"
                variant="outline"
                fullWidth
                loading={whatsapp.busy === `/posts/${id}/contact`}
                onPress={() =>
                  void whatsapp.open(
                    `/posts/${id}/contact`,
                    `Oi! Sou quem adotou ${name} pelo Égua, adota! e queria uma orientação.`,
                  )
                }
              />
            ) : (
              <Button
                title={`Falar com ${followup.tutor.name.split(' ')[0]}`}
                icon="message-circle"
                variant="outline"
                fullWidth
                loading={whatsapp.busy === `/adoption-followups/${followup.id}/contact`}
                onPress={() =>
                  void whatsapp.open(
                    `/adoption-followups/${followup.id}/contact`,
                    `Oi, ${followup.tutor.name.split(' ')[0]}! Vi no Égua, adota! como está a adaptação de ${name}. Posso ajudar?`,
                  )
                }
              />
            )}
          </>
        ) : null}

        {message ? <Notice tone="error" message={message} /> : null}
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header
            title="Acompanhamento da adoção"
            subtitle={post.data ? name : undefined}
            onBack={() => (router.canGoBack() ? router.back() : router.replace(`/post/${id}`))}
          />
          <View style={styles.body}>{body}</View>
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
  section: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  flex: { flex: 1 },
  moods: { gap: spacing.sm },
  checkin: { gap: spacing.xs, padding: spacing.lg },
  checkinTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});

// Uma tela quebrada não derruba o app.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
