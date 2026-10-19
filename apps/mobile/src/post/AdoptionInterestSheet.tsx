import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { api, messageFrom } from '../api';
import { AppText, BottomSheet, Button, Chip, Input, Notice } from '../components/ui';
import { spacing } from '../theme';
import {
  completeAnswers,
  hadPetsChoices,
  homeChoices,
  householdChoices,
  NOTE_LIMIT,
  otherAnimalChoices,
  safeHomeChoices,
  safeHomeQuestion,
  type AdoptionAnswers,
  type AnswerDraft,
  type Choice,
} from './adoptionInterest';

function Question<Value>({
  title,
  choices,
  value,
  onChange,
}: {
  title: string;
  choices: Choice<Value>[];
  value: Value | undefined;
  onChange: (value: Value) => void;
}) {
  return (
    <View style={styles.question} accessibilityRole="radiogroup" accessibilityLabel={title}>
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
 * "Quero adotar": antes do WhatsApp, cinco perguntas de tocar. A ficha fica salva para quem
 * cuida e volta preenchida no próximo animal. `onSent` abre a conversa com as respostas escritas.
 */
export function AdoptionInterestSheet({
  visible,
  postId,
  species,
  token,
  onClose,
  onSent,
}: {
  visible: boolean;
  postId: string;
  species: string;
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
        <Question
          title="Onde você mora?"
          choices={homeChoices}
          value={current.home}
          onChange={(home) => set({ home })}
        />
        <Question
          title={safeHomeQuestion(species)}
          choices={safeHomeChoices}
          value={current.safeHome}
          onChange={(safeHome) => set({ safeHome })}
        />
        <Question
          title="Tem outros animais em casa?"
          choices={otherAnimalChoices}
          value={current.otherAnimals}
          onChange={(otherAnimals) => set({ otherAnimals })}
        />
        <Question
          title="Quem mora com você concorda com a adoção?"
          choices={householdChoices}
          value={current.household}
          onChange={(household) => set({ household })}
        />
        <Question
          title="Já teve animal antes?"
          choices={hadPetsChoices}
          value={current.hadPets}
          onChange={(hadPets) => set({ hadPets })}
        />
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
          title={answers ? 'Mandar ficha e abrir o WhatsApp' : 'Responda as 5 perguntas'}
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
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.sm },
});
