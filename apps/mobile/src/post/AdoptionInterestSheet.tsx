import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { api, messageFrom } from '../api';
import {
  AppText,
  BottomSheet,
  Button,
  Chip,
  Icon,
  Input,
  Notice,
  ProgressBar,
  type IconName,
} from '../components/ui';
import { radius, spacing, useTheme } from '../theme';
import type { AnimalCare } from './care';
import {
  buildingChoices,
  completeAnswers,
  fitWarnings,
  hadPetsChoices,
  homeChoices,
  householdChoices,
  kidsChoices,
  livesWithChoices,
  livesWithOf,
  missingCount,
  NOTE_LIMIT,
  otherAnimalChoices,
  othersCaredChoices,
  safeHomeChoices,
  safeHomeQuestion,
  visibleQuestions,
  type AdoptionAnswers,
  type AnswerDraft,
  type Choice,
} from './adoptionInterest';

/** Um bloco da ficha: ícone, título e as perguntas daquele assunto. */
function Group({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: colors.surfaceMuted }]}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={icon} size="sm" color={colors.onPrimarySoft} />
        </View>
        <AppText variant="h3">{title}</AppText>
      </View>
      {children}
    </View>
  );
}

function Question<Value>({
  title,
  choices,
  value,
  onChange,
  followUp = false,
}: {
  title: string;
  choices: Choice<Value>[];
  value: Value | undefined;
  onChange: (value: Value) => void;
  /** Pergunta que apareceu por causa da anterior: fica recuada, presa a ela. */
  followUp?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.question, followUp && [styles.followUp, { borderLeftColor: colors.primary }]]}
      accessibilityRole="radiogroup"
      accessibilityLabel={title}
    >
      <AppText variant="bodyStrong">{title}</AppText>
      <View style={styles.choices}>
        {choices.map((choice) => (
          <Chip
            key={String(choice.value)}
            label={choice.label}
            selected={value === choice.value}
            onPress={() => onChange(choice.value)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * "Quero adotar": antes do WhatsApp, perguntas de tocar que mudam com as respostas. A ficha fica salva para quem
 * cuida e volta preenchida no próximo animal. `onSent` abre a conversa com as respostas escritas.
 */
export function AdoptionInterestSheet({
  visible,
  postId,
  species,
  care,
  token,
  onClose,
  onSent,
}: {
  visible: boolean;
  postId: string;
  species: string;
  /** O que quem cuida já disse do animal, para avisar quando a ficha não combina. */
  care?: AnimalCare | null;
  token: string | null;
  onClose: () => void;
  onSent: (answers: AdoptionAnswers, note: string) => void;
}) {
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<AnswerDraft>({});
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = useQuery({
    queryKey: ['adoption-interest', 'mine', token],
    queryFn: () => api<{ answers: AdoptionAnswers | null }>('/me/adoption-interest', { token }),
    enabled: visible && Boolean(token),
    staleTime: 5 * 60_000,
  });
  const remembered = previous.data?.answers ?? null;

  // A última ficha vem preenchida; o que a pessoa toca agora vale por cima.
  const current: AnswerDraft = { ...(remembered ?? {}), ...draft };
  const answers = completeAnswers(current);
  const shown = new Set(visibleQuestions(current));
  const missing = missingCount(current);
  const total = shown.size;
  const warnings = fitWarnings(current, care);
  const set = (patch: AnswerDraft) => setDraft((before) => ({ ...before, ...patch }));

  async function send() {
    if (!answers || sending) return;
    if (!token) {
      setError('Entre na sua conta para mandar a ficha.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const trimmed = note.trim();
      await api(`/posts/${postId}/adoption-interest`, {
        method: 'POST',
        token,
        body: { ...answers, ...(trimmed ? { note: trimmed } : {}) },
      });
      onSent(answers, trimmed);
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Antes de chamar no WhatsApp">
      <ScrollView style={{ maxHeight: height * 0.62 }} contentContainerStyle={styles.body}>
        <AppText color="textSecondary">
          Responda rapidinho. Suas respostas vão na primeira mensagem e ajudam quem cuida a conhecer
          você. Endereço e documento vocês combinam na conversa.
        </AppText>
        <ProgressBar
          value={(total - missing) / total}
          label="Sua ficha"
          caption={`${total - missing} de ${total}`}
        />
        <Group icon="home" title="Sua casa">
          <Question
            title="Onde você mora?"
            choices={homeChoices}
            value={current.home}
            onChange={(home) => set({ home })}
          />
          {shown.has('buildingAllows') ? (
            <Question
              followUp
              title="O condomínio aceita animais?"
              choices={buildingChoices}
              value={current.buildingAllows}
              onChange={(buildingAllows) => set({ buildingAllows })}
            />
          ) : null}
          <Question
            followUp={current.home !== undefined}
            title={safeHomeQuestion(species, current.home)}
            choices={safeHomeChoices}
            value={current.safeHome}
            onChange={(safeHome) => set({ safeHome })}
          />
        </Group>
        <Group icon="smile" title="Outros animais">
          <Question
            title="Tem outros animais em casa?"
            choices={otherAnimalChoices}
            value={current.otherAnimals}
            onChange={(otherAnimals) => set({ otherAnimals })}
          />
          {shown.has('othersCared') ? (
            <Question
              followUp
              title="Eles são vacinados e castrados?"
              choices={othersCaredChoices}
              value={current.othersCared}
              onChange={(othersCared) => set({ othersCared })}
            />
          ) : null}
        </Group>
        <Group icon="users" title="Quem mora com você">
          <Question
            title="Você mora com mais alguém?"
            choices={livesWithChoices}
            value={livesWithOf(current)}
            onChange={(livesWith) => set({ livesWith })}
          />
          {shown.has('household') ? (
            <Question
              followUp
              title="Todos concordam com a adoção?"
              choices={householdChoices}
              value={current.household === 'alone' ? undefined : current.household}
              onChange={(household) => set({ household })}
            />
          ) : null}
          {shown.has('kids') ? (
            <Question
              followUp
              title="Tem criança em casa?"
              choices={kidsChoices}
              value={current.kids}
              onChange={(kids) => set({ kids })}
            />
          ) : null}
        </Group>
        <Group icon="heart" title="Sua experiência">
          <Question
            title="Já teve animal antes?"
            choices={hadPetsChoices}
            value={current.hadPets}
            onChange={(hadPets) => set({ hadPets })}
          />
        </Group>
        {warnings.map((warning) => (
          <Notice key={warning} tone="warning" message={warning} />
        ))}
        <Input
          label="Quer contar mais alguma coisa? (opcional)"
          value={note}
          onChangeText={(text) => setNote(text.slice(0, NOTE_LIMIT))}
          placeholder="Por exemplo: trabalho em casa e tenho tempo para ele"
          multiline
          maxLength={NOTE_LIMIT}
        />
      </ScrollView>
      <View style={styles.footer}>
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title={
            answers
              ? 'Mandar ficha e abrir o WhatsApp'
              : missing === 1
                ? 'Falta 1 pergunta'
                : `Faltam ${missing} perguntas`
          }
          icon="message-circle"
          fullWidth
          disabled={!answers}
          loading={sending}
          onPress={() => void send()}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.md },
  question: { gap: spacing.sm },
  followUp: { borderLeftWidth: 3, paddingLeft: spacing.md, marginLeft: spacing.xs },
  group: { gap: spacing.lg, padding: spacing.lg, borderRadius: radius.lg },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.sm },
});
