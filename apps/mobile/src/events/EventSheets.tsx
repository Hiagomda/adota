import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import {
  AppText,
  Avatar,
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  Notice,
  SkeletonRows,
} from '../components/ui';
import { spacing } from '../theme';
import { checkInOpen, type CommunityEvent, type EventParticipant } from './agenda';

/** Inscrição com um recado opcional: o que a pessoa pode levar ou fazer. */
export function RegisterSheet({
  visible,
  event,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  event: CommunityEvent;
  token: string | null;
  onClose: () => void;
  onDone: (status: string) => void | Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const full = event.capacity !== null && (event.spotsLeft ?? 0) === 0;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ status: string }>(`/events/${event.id}/registrations`, {
        method: 'POST',
        token,
        body: note.trim() ? { note: note.trim() } : {},
      });
      await onDone(result.status);
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={full ? 'Entrar na fila' : 'Quero participar'}
    >
      <View style={styles.body}>
        <AppText color="textSecondary">
          {full
            ? 'As vagas acabaram. Na fila, você sobe sozinho quando alguém desistir e recebe um aviso.'
            : 'Você recebe lembrete na véspera e perto da hora. Se não puder ir, desista para liberar a vaga.'}
        </AppText>
        <Input
          label={
            event.needs.length > 0
              ? 'Pode ajudar com algo? (se quiser)'
              : 'Recado para quem organiza (se quiser)'
          }
          value={note}
          onChangeText={setNote}
          placeholder="Ex.: levo 2 kg de ração; posso ajudar na recepção"
          maxLength={200}
          multiline
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title={full ? 'Entrar na fila de espera' : 'Confirmar inscrição'}
          icon="check"
          variant="secondary"
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </BottomSheet>
  );
}

/** Lista de quem vai, com a presença marcada no dia. Só quem organiza abre. */
export function ParticipantsSheet({
  visible,
  event,
  token,
  onClose,
  onError,
}: {
  visible: boolean;
  event: CommunityEvent;
  token: string | null;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const participants = useQuery({
    queryKey: ['event', event.id, 'participants', token],
    queryFn: () =>
      api<{ participants: EventParticipant[] }>(`/events/${event.id}/participants`, { token }),
    enabled: visible,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const canCheckIn = checkInOpen(event);
  const list = participants.data?.participants ?? [];
  const confirmed = list.filter((item) => item.status === 'registered' && item.confirmedAt).length;

  async function mark(person: EventParticipant, attended: boolean) {
    if (busy) return;
    setBusy(person.person.id);
    try {
      await api(`/events/${event.id}/participants/${person.person.id}/attendance`, {
        method: 'POST',
        token,
        body: { attended },
      });
      await participants.refetch();
    } catch (failure) {
      onError(messageFrom(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Participantes">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        {participants.isLoading ? (
          <SkeletonRows />
        ) : participants.isError ? (
          <ErrorState
            title="Não consegui carregar a lista"
            body={messageFrom(participants.error)}
            onRetry={() => void participants.refetch()}
          />
        ) : list.length === 0 ? (
          <EmptyState
            compact
            pose="sit"
            title="Ninguém inscrito ainda"
            body="Divulgue o evento nas suas redes."
          />
        ) : (
          <>
            <AppText variant="bodySmall" color="textSecondary">
              {`${event.registered} inscritos, ${confirmed} confirmaram presença${event.waitlisted > 0 ? `, ${event.waitlisted} na fila` : ''}.`}
              {canCheckIn ? ' Marque quem apareceu.' : ' A presença é marcada no dia.'}
            </AppText>
            {list.map((item) => (
              <View key={item.person.id} style={styles.person}>
                <Avatar name={item.person.name} uri={item.person.avatarUrl} size="sm" />
                <View style={styles.grow}>
                  <AppText variant="bodyStrong">{item.person.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {item.status === 'waitlist'
                      ? 'Na fila de espera'
                      : item.confirmedAt
                        ? 'Confirmou presença'
                        : 'Inscrito'}
                  </AppText>
                  {item.note ? <AppText variant="bodySmall">{item.note}</AppText> : null}
                  {item.status === 'registered' && canCheckIn ? (
                    <Checkbox
                      label="Apareceu"
                      checked={Boolean(item.checkedInAt)}
                      disabled={busy === item.person.id}
                      onChange={(checked) => void mark(item, checked)}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

/** Motivo do cancelamento: vai no aviso para quem se inscreveu. */
export function CancelSheet({
  visible,
  event,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  event: CommunityEvent;
  token: string | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (reason.trim().length < 5) {
      setError('Conte em poucas palavras por que o evento foi cancelado.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/events/${event.id}/cancel`, {
        method: 'POST',
        token,
        body: { reason: reason.trim() },
      });
      await onDone();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Cancelar evento">
      <View style={styles.body}>
        <AppText color="textSecondary">
          {event.registered + event.waitlisted > 0
            ? `${event.registered + event.waitlisted} pessoas recebem aviso com o motivo.`
            : 'O evento fica na agenda marcado como cancelado até a data.'}
        </AppText>
        <Input
          label="Motivo"
          value={reason}
          onChangeText={setReason}
          placeholder="Ex.: previsão de chuva forte; remarcamos em breve"
          maxLength={300}
          multiline
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Cancelar evento"
          variant="destructive"
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </BottomSheet>
  );
}

function wholeNumber(value: string): number | undefined {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

/** Como foi: fica no histórico do evento para todo mundo ver. */
export function ResultSheet({
  visible,
  event,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  event: CommunityEvent;
  token: string | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [summary, setSummary] = useState(event.result?.summary ?? '');
  const [adoptions, setAdoptions] = useState(
    event.result?.adoptions !== null && event.result?.adoptions !== undefined
      ? String(event.result.adoptions)
      : '',
  );
  const [served, setServed] = useState(
    event.result?.animalsServed !== null && event.result?.animalsServed !== undefined
      ? String(event.result.animalsServed)
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (summary.trim().length < 3) {
      setError('Conte em poucas palavras como foi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/events/${event.id}/result`, {
        method: 'POST',
        token,
        body: {
          summary: summary.trim(),
          ...(wholeNumber(adoptions) !== undefined ? { adoptions: wholeNumber(adoptions) } : {}),
          ...(wholeNumber(served) !== undefined ? { animalsServed: wholeNumber(served) } : {}),
        },
      });
      await onDone();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Como foi o evento">
      <View style={styles.body}>
        <Input
          label="Resumo"
          value={summary}
          onChangeText={setSummary}
          placeholder="Ex.: 32 animais castrados, 3 adoções e 40 kg de ração arrecadados"
          maxLength={500}
          multiline
        />
        <View style={styles.row}>
          <View style={styles.grow}>
            <Input
              label="Adoções"
              value={adoptions}
              onChangeText={(text) => setAdoptions(text.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.grow}>
            <Input
              label="Animais atendidos"
              value={served}
              onChangeText={(text) => setServed(text.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
            />
          </View>
        </View>
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Salvar resultado"
          icon="award"
          variant="secondary"
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </BottomSheet>
  );
}

const reportReasons = [
  'Venda de animal',
  'Pede dinheiro de forma suspeita',
  'Evento falso ou enganoso',
  'Lugar ou horário errado',
];

export function ReportSheet({
  visible,
  event,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  event: CommunityEvent;
  token: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || !reason) return;
    setSaving(true);
    setError(null);
    try {
      const text = detail.trim() ? `${reason}: ${detail.trim()}` : reason;
      await api(`/events/${event.id}/report`, {
        method: 'POST',
        token,
        body: { reason: text.slice(0, 300) },
      });
      onDone();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Denunciar evento">
      <View style={styles.body}>
        <AppText color="textSecondary">
          A equipe confere. Quem organizou não fica sabendo quem denunciou.
        </AppText>
        <View style={styles.wrap}>
          {reportReasons.map((option) => (
            <Chip
              key={option}
              label={option}
              selected={reason === option}
              onPress={() => setReason(option)}
            />
          ))}
        </View>
        <Input
          label="Detalhes (se quiser)"
          value={detail}
          onChangeText={setDetail}
          maxLength={200}
          multiline
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Enviar denúncia"
          variant="destructive"
          fullWidth
          disabled={!reason}
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 520 },
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  person: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  grow: { flex: 1, gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
