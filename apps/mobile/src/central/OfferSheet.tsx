import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import { AppText, BottomSheet, Button, Chip, Input, Notice } from '../components/ui';
import { spacing } from '../theme';
import { helpOfferKinds, offerFormError, type HelpOfferKind } from './central';

/**
 * Oferecer ajuda num resgate sem ir até o animal. Repetir o envio (internet caiu no meio) não
 * duplica: o servidor devolve a oferta que já existe.
 */
export function OfferSheet({
  visible,
  postId,
  token,
  already,
  onClose,
  onSent,
}: {
  visible: boolean;
  postId: string | null;
  token: string | null;
  /** Tipos que a pessoa já ofereceu nesse resgate. */
  already: readonly HelpOfferKind[];
  onClose: () => void;
  onSent: (kind: HelpOfferKind) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<HelpOfferKind | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Cada abertura começa do zero, para a oferta de um caso não ir parar em outro.
  function reset() {
    setKind(null);
    setNote('');
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function send() {
    if (sending || !postId) return;
    const problem = offerFormError(kind, note);
    if (problem || !kind) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api(`/posts/${postId}/help-offers`, {
        method: 'POST',
        token,
        body: { kind, note: note.trim() || undefined },
      });
      reset();
      await onSent(kind);
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSending(false);
    }
  }

  const selected = helpOfferKinds.find((item) => item.value === kind);
  return (
    <BottomSheet visible={visible} onClose={close} title="Como você pode ajudar?">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {helpOfferKinds.map((item) => {
            const done = already.includes(item.value);
            return (
              <Chip
                key={item.value}
                label={done ? `${item.label} (já ofereceu)` : item.label}
                icon={item.icon}
                selected={kind === item.value}
                disabled={done}
                onPress={() => setKind(item.value)}
              />
            );
          })}
        </View>
        {selected ? (
          <AppText variant="bodySmall" color="textSecondary">
            {selected.hint}
          </AppText>
        ) : null}
        <Input
          label={kind === 'other' ? 'Como você pode ajudar' : 'Recado (opcional)'}
          placeholder="Ex.: posso ficar com ele até sexta"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={300}
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Oferecer ajuda"
          icon="heart"
          fullWidth
          loading={sending}
          disabled={!kind}
          onPress={() => void send()}
        />
        <AppText variant="caption" color="textSecondary">
          Quem cuida do resgate recebe o aviso e responde. O recado só aparece para essa pessoa e
          para a equipe. Não coloque telefone nem endereço aqui.
        </AppText>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
