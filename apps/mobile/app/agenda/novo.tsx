import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Chip,
  ErrorState,
  Header,
  Input,
  Notice,
  SkeletonRows,
  useToast,
  type IconName,
} from '../../src/components/ui';
import {
  belemDayKey,
  categories,
  categoryIcons,
  categoryLabels,
  needLabels,
  needs as allNeeds,
  newClientKey,
  verifiedOnly,
  upcomingDays,
  type CommunityEvent,
  type EventCategory,
  type EventDetail,
  type EventNeed,
} from '../../src/events/agenda';
import { fairRange, type FairDay } from '../../src/events/fairs';
import type { MapPoint } from '../../src/map/geo';
import { insideServiceArea } from '../../src/map/serviceArea';
import { placeLabel, useAddress } from '../../src/place/address';
import { useAnimalGps } from '../../src/place/gps';
import { PlacePicker } from '../../src/place/PlacePicker';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;
const PLACE_MAX = 160;
const NEEDS_NOTE_MAX = 300;
const DAYS_AHEAD = 90;
const startHours = [7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19];
const durations = [1, 2, 3, 4, 6, 8];

function durationHours(event: CommunityEvent): number {
  return Math.max(
    1,
    Math.round((Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 3_600_000),
  );
}

/** Hora cheia de Belém (UTC-3) de um instante. */
function belemHour(instant: string): number {
  return (new Date(instant).getUTCHours() + 21) % 24;
}

interface Verification {
  verified: boolean;
  role: string;
}

/**
 * Marcar ou editar um evento da agenda. Feira e arrecadação só para ONG ou protetor
 * verificado; o resto qualquer pessoa marca e a equipe aprova antes de aparecer.
 */
export default function EventFormScreen() {
  const params = useLocalSearchParams<{ id?: string; categoria?: string }>();
  const editingId = params.id ?? null;
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const existing = useQuery({
    queryKey: ['event', editingId, token],
    queryFn: () => api<EventDetail>(`/events/${editingId}`, { token }),
    enabled: Boolean(editingId),
  });
  const startCategory = categories.includes(params.categoria as EventCategory)
    ? (params.categoria as EventCategory)
    : 'community';

  if (editingId && (existing.isLoading || existing.isError)) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <Header title="Editar evento" onBack={() => router.back()} />
          {existing.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : (
            <ErrorState
              title="Não consegui abrir o evento"
              body={messageFrom(existing.error)}
              onRetry={() => void existing.refetch()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <EventForm
      key={existing.data?.event.version ?? 'novo'}
      editingId={editingId}
      initial={existing.data?.event ?? null}
      startCategory={startCategory}
    />
  );
}

function EventForm({
  editingId,
  initial,
  startCategory,
}: {
  editingId: string | null;
  initial: CommunityEvent | null;
  startCategory: EventCategory;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const gps = useAnimalGps();
  const [clientKey] = useState(() => newClientKey());

  const verification = useQuery({
    queryKey: ['me', 'verification', token],
    queryFn: () => api<Verification>('/me/verification', { token }),
    enabled: Boolean(token),
  });
  const trusted = verification.data
    ? (verification.data.verified &&
        (verification.data.role === 'ngo' || verification.data.role === 'protector')) ||
      verification.data.role === 'admin' ||
      verification.data.role === 'superadmin'
    : false;

  // Na edição, o formulário começa com o que já está salvo.
  const [category, setCategory] = useState<EventCategory>(initial?.category ?? startCategory);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [day, setDay] = useState<string | null>(initial ? belemDayKey(initial.startsAt) : null);
  const [startHour, setStartHour] = useState<number | null>(
    initial ? belemHour(initial.startsAt) : null,
  );
  const [hours, setHours] = useState(initial ? durationHours(initial) : 3);
  const [capacity, setCapacity] = useState(
    initial?.capacity !== null && initial?.capacity !== undefined ? String(initial.capacity) : '',
  );
  const [chosenNeeds, setChosenNeeds] = useState<EventNeed[]>(initial?.needs ?? []);
  const [needsNote, setNeedsNote] = useState(initial?.needsNote ?? '');
  const [manual, setManual] = useState<MapPoint | null>(initial?.location ?? null);
  const [typed, setTyped] = useState(initial?.placeLabel ?? '');
  const [placeTouched, setPlaceTouched] = useState(Boolean(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Na edição o mapa abre no ponto salvo uma vez só; depois a câmera é da pessoa.
  const [editFocus] = useState<MapPoint | null>(initial?.location ?? null);

  const days = useMemo<FairDay[]>(() => {
    const list = upcomingDays(DAYS_AHEAD);
    if (day && !list.some((item) => item.key === day)) {
      const [, month, date] = day.split('-');
      return [{ key: day, label: `${date}/${month}` }, ...list];
    }
    return list;
  }, [day]);
  const hourOptions =
    startHour !== null && !startHours.includes(startHour)
      ? [...startHours, startHour].sort((a, b) => a - b)
      : startHours;
  const durationOptions = durations.includes(hours)
    ? durations
    : [...durations, hours].sort((a, b) => a - b);

  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = manual ?? located;
  const { address } = useAddress(point);
  const suggested = point && address ? placeLabel(point, address).slice(0, PLACE_MAX) : '';
  const place = placeTouched ? typed : suggested;
  const capacityNumber = capacity.trim() ? Number(capacity.trim()) : null;
  const capacityValid =
    capacityNumber === null ||
    (Number.isInteger(capacityNumber) && capacityNumber >= 1 && capacityNumber <= 2000);

  const ready =
    title.trim().length >= 3 && day && startHour !== null && point && place.trim() && capacityValid;

  function toggleNeed(need: EventNeed) {
    setChosenNeeds((current) =>
      current.includes(need) ? current.filter((item) => item !== need) : [...current, need],
    );
  }

  async function send() {
    if (!token) {
      setMessage('Entre na sua conta para marcar um evento.');
      return;
    }
    if (!ready || !day || startHour === null || !point) {
      setMessage(
        capacityValid
          ? 'Preencha o nome, o dia, o horário e o lugar.'
          : 'As vagas são um número de 1 a 2000, ou deixe vazio para não ter limite.',
      );
      return;
    }
    setSending(true);
    setMessage(null);
    const body = {
      title: title.trim(),
      description: description.trim(),
      category,
      placeLabel: place.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
      capacity: capacityNumber,
      needs: chosenNeeds,
      needsNote: needsNote.trim(),
      ...fairRange(day, startHour, hours),
    };
    try {
      if (editingId && initial) {
        await api(`/events/${editingId}`, {
          method: 'PATCH',
          token,
          body: { ...body, version: initial.version },
        });
        toast.show(
          'Evento atualizado. Quem se inscreveu recebe aviso se mudou dia, hora ou lugar.',
          'success',
        );
      } else {
        const created = await api<{ id: string; reviewStatus: string }>('/events', {
          method: 'POST',
          token,
          body: { ...body, clientKey },
        });
        toast.show(
          created.reviewStatus === 'pending'
            ? 'Evento enviado. A equipe confere e ele aparece na agenda depois de aprovado.'
            : 'Evento na agenda!',
          'success',
        );
        router.replace(`/evento/${created.id}`);
      }
      await client.invalidateQueries({ queryKey: ['events'] });
      await client.invalidateQueries({ queryKey: ['event'] });
      await client.invalidateQueries({ queryKey: ['adoption-events'] });
      if (editingId) router.back();
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header
            title={editingId ? 'Editar evento' : 'Marcar um evento'}
            onBack={() => router.back()}
          />
          <View style={styles.body}>
            {!editingId && !trusted ? (
              <Notice
                tone="info"
                message="A equipe confere o evento antes de ele aparecer na agenda. Feira de adoção e arrecadação são só para ONG ou protetor verificado."
              />
            ) : null}

            <AppText variant="bodyStrong">Tipo</AppText>
            <View style={styles.wrap}>
              {categories.map((option) => {
                const locked = verifiedOnly.includes(option) && !trusted;
                return (
                  <Chip
                    key={option}
                    label={categoryLabels[option]}
                    icon={(locked ? 'lock' : categoryIcons[option]) as IconName}
                    selected={category === option}
                    disabled={locked}
                    onPress={() => setCategory(option)}
                  />
                );
              })}
            </View>

            <Input
              label="Nome do evento"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex.: Mutirão de castração no Guamá"
              maxLength={TITLE_MAX}
            />

            <AppText variant="bodyStrong">Dia</AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bleed}
              contentContainerStyle={styles.chipRail}
            >
              {days.map((option) => (
                <Chip
                  key={option.key}
                  label={option.label}
                  selected={day === option.key}
                  onPress={() => setDay(option.key)}
                />
              ))}
            </ScrollView>

            <AppText variant="bodyStrong">Começa às (horário de Belém)</AppText>
            <View style={styles.wrap}>
              {hourOptions.map((hour) => (
                <Chip
                  key={hour}
                  label={`${hour}h`}
                  selected={startHour === hour}
                  onPress={() => setStartHour(hour)}
                />
              ))}
            </View>

            <AppText variant="bodyStrong">Dura</AppText>
            <View style={styles.wrap}>
              {durationOptions.map((option) => (
                <Chip
                  key={option}
                  label={option === 1 ? '1 hora' : `${option} horas`}
                  selected={hours === option}
                  onPress={() => setHours(option)}
                />
              ))}
            </View>

            <AppText variant="bodyStrong">Onde</AppText>
            <AppText variant="bodySmall" color="textSecondary">
              {manual
                ? 'Ponto escolhido no mapa.'
                : located
                  ? 'O mapa abriu onde você está. Arraste até o lugar do evento.'
                  : 'Arraste o mapa até o lugar do evento.'}
            </AppText>
            <View style={styles.map}>
              <PlacePicker
                focus={editFocus ?? (manual ? null : located)}
                accuracyM={manual ? null : (located?.accuracy ?? null)}
                urgency="low"
                onOutside={() => setMessage('Esse ponto fica fora de Belém.')}
                onChange={(next, fromUser) => {
                  if (!fromUser || !insideServiceArea(next)) return;
                  setManual(next);
                  setMessage(null);
                }}
              />
              {gps.status === 'loading' && !manual ? (
                <View style={[styles.loading, { backgroundColor: colors.overlay }]}>
                  <ActivityIndicator color={colors.onMedia} />
                  <AppText variant="bodyStrong" style={{ color: colors.onMedia }}>
                    Buscando o GPS...
                  </AppText>
                </View>
              ) : null}
            </View>
            <Input
              label="Nome do lugar"
              value={place}
              onChangeText={(text) => {
                setPlaceTouched(true);
                setTyped(text);
              }}
              placeholder="Ex.: Praça do Guamá · Guamá · Belém"
              maxLength={PLACE_MAX}
              helper="Use um lugar público: o ponto aparece exato para todo mundo. Coloque o bairro para o filtro de região."
            />

            <Input
              label="Vagas (deixe vazio para não ter limite)"
              value={capacity}
              onChangeText={(text) => setCapacity(text.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="Ex.: 40"
              error={capacityValid ? undefined : 'Use um número de 1 a 2000.'}
              helper="Quando lotar, quem chegar entra na fila de espera e sobe sozinho se alguém desistir."
            />

            <AppText variant="bodyStrong">Do que o evento precisa</AppText>
            <View style={styles.wrap}>
              {allNeeds.map((need) => (
                <Chip
                  key={need}
                  label={needLabels[need]}
                  selected={chosenNeeds.includes(need)}
                  onPress={() => toggleNeed(need)}
                />
              ))}
            </View>
            <Input
              label="Detalhe das necessidades (se quiser)"
              value={needsNote}
              onChangeText={setNeedsNote}
              placeholder="Ex.: 5 voluntários para a recepção, sacos de ração filhote"
              maxLength={NEEDS_NOTE_MAX}
              multiline
            />
            <Input
              label="Descrição (se quiser)"
              value={description}
              onChangeText={setDescription}
              placeholder="Ex.: traga documento com foto; animais castrados e vacinados"
              maxLength={DESCRIPTION_MAX}
              multiline
            />
            {message ? <Notice tone="error" message={message} /> : null}
            <Button
              title={editingId ? 'Salvar mudanças' : 'Marcar evento'}
              icon="calendar"
              variant="secondary"
              size="lg"
              fullWidth
              loading={sending}
              disabled={!ready}
              onPress={() => void send()}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  bleed: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  chipRail: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  map: { borderRadius: radius.lg, overflow: 'hidden' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
