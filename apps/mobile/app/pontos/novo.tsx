import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Card,
  Chip,
  ErrorState,
  Header,
  Icon,
  Input,
  Notice,
  SkeletonRows,
  Touchable,
  useToast,
  type IconName,
} from '../../src/components/ui';
import { loadMyFeedPoints } from '../../src/feedPoints/api';
import { FeedPointDetails, FeedPointPin } from '../../src/feedPoints/FeedPointDetails';
import { FeedPointPhoto } from '../../src/feedPoints/FeedPointPhoto';
import {
  feedPointKindLabels,
  feedPointKinds,
  feedPointRelationLabels,
  noteIdeas,
  type FeedPoint,
  type FeedPointKind,
  type FeedPointRelation,
  type OwnFeedPoint,
} from '../../src/feedPoints/feedPoints';
import type { MapPoint } from '../../src/map/geo';
import { insideServiceArea } from '../../src/map/serviceArea';
import { placeLabel, useAddress } from '../../src/place/address';
import { useAnimalGps } from '../../src/place/gps';
import { PlacePicker } from '../../src/place/PlacePicker';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const NOTE_MAX = 300;
const ADDRESS_MAX = 160;

const relationIcons: Record<FeedPointRelation, IconName> = { mine: 'heart', known: 'eye' };

/** Cadastro (ou edição) de um ponto solidário de ração e água. */
export default function FeedPointFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ?? null;
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const mine = useQuery({
    queryKey: ['feed-points', 'mine', token],
    queryFn: () => loadMyFeedPoints(token),
    enabled: Boolean(editingId && token),
  });
  const existing = editingId
    ? (mine.data?.points.find((point) => point.id === editingId) ?? null)
    : null;

  if (editingId && !existing) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <Header title="Editar ponto" onBack={() => router.back()} />
          {mine.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : (
            <ErrorState
              title="Não consegui abrir o ponto"
              body={mine.isError ? messageFrom(mine.error) : 'Esse ponto não existe mais.'}
              onRetry={() => void mine.refetch()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return <FeedPointForm key={existing?.updatedAt ?? 'novo'} initial={existing} />;
}

function FeedPointForm({ initial }: { initial: OwnFeedPoint | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const verified = useSession((state) => state.user?.verified ?? false);
  const gps = useAnimalGps();

  const [kind, setKind] = useState<FeedPointKind>(initial?.kind ?? 'both');
  const [relation, setRelation] = useState<FeedPointRelation>(initial?.relation ?? 'mine');
  const [note, setNote] = useState(initial?.note ?? '');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [manual, setManual] = useState<MapPoint | null>(initial?.location ?? null);
  const [typed, setTyped] = useState(initial?.addressText ?? '');
  const [addressTouched, setAddressTouched] = useState(Boolean(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [editFocus] = useState<MapPoint | null>(initial?.location ?? null);

  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = manual ?? located;
  const { address } = useAddress(point);
  const suggested = point && address ? placeLabel(point, address).slice(0, ADDRESS_MAX) : '';
  const addressText = addressTouched ? typed : suggested;
  const ready = point !== null && addressText.trim().length >= 3;

  const preview: FeedPoint = {
    id: initial?.id ?? 'previa',
    kind,
    kindLabel: feedPointKindLabels[kind],
    relation,
    addressText: addressText.trim() || 'Endereço do ponto',
    note: note.trim() || null,
    location: point ?? { latitude: -1.45, longitude: -48.49 },
    photo: null,
    lastRefilledAt: relation === 'mine' ? new Date().toISOString() : null,
    lastEmptyAt: null,
    lastCheckedAt: null,
    createdAt: new Date().toISOString(),
  };

  async function send() {
    if (!token) {
      setMessage('Entre na sua conta para cadastrar o ponto.');
      return;
    }
    if (!ready || !point) {
      setMessage('Marque o lugar no mapa e confira o endereço.');
      return;
    }
    setSending(true);
    setMessage(null);
    const body = {
      kind,
      relation,
      addressText: addressText.trim(),
      note: note.trim() || undefined,
      latitude: point.latitude,
      longitude: point.longitude,
      photoKey: photoKey ?? undefined,
      removePhoto: initial && photoRemoved && !photoKey ? true : undefined,
    };
    try {
      if (initial) {
        const result = await api<{ status: string }>(`/feed-points/${initial.id}`, {
          method: 'PATCH',
          token,
          body,
        });
        toast.show(
          result.status === 'approved'
            ? 'Ponto atualizado no mapa.'
            : 'Mudanças enviadas. A equipe confere de novo antes de voltar ao mapa.',
          'success',
        );
      } else {
        const result = await api<{ status: string }>('/feed-points', {
          method: 'POST',
          token,
          body,
        });
        toast.show(
          result.status === 'approved'
            ? 'Ponto no mapa! Obrigado por cuidar.'
            : 'Ponto enviado! Você recebe um aviso quando a equipe aprovar.',
          'success',
        );
      }
      await client.invalidateQueries({ queryKey: ['feed-points'] });
      router.back();
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
            title={initial ? 'Editar ponto' : 'Novo ponto solidário'}
            onBack={() => router.back()}
          />
          <View style={styles.body}>
            {initial?.status === 'approved' && !verified ? (
              <Notice
                tone="info"
                message="Ao salvar, o ponto sai do mapa até a equipe conferir as mudanças."
              />
            ) : null}

            <FormSection step={1} title="O que tem no ponto" icon="droplet">
              <View style={styles.wrap}>
                {feedPointKinds.map((option) => (
                  <Chip
                    key={option}
                    label={feedPointKindLabels[option]}
                    selected={kind === option}
                    onPress={() => setKind(option)}
                  />
                ))}
              </View>
              <AppText variant="bodyStrong">Quem cuida</AppText>
              <View style={styles.options}>
                {(['mine', 'known'] as const).map((option) => {
                  const selected = relation === option;
                  return (
                    <Touchable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setRelation(option)}
                      style={[
                        styles.option,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primarySoft : colors.surface,
                        },
                      ]}
                    >
                      <Icon
                        name={relationIcons[option]}
                        color={selected ? colors.primary : colors.textSecondary}
                      />
                      <AppText variant="bodySmall" style={styles.grow}>
                        {feedPointRelationLabels[option]}
                      </AppText>
                      <Icon
                        name={selected ? 'check-circle' : 'circle'}
                        size="sm"
                        color={selected ? colors.primary : colors.textDisabled}
                      />
                    </Touchable>
                  );
                })}
              </View>
              <AppText variant="caption" color="textSecondary">
                {relation === 'mine'
                  ? 'Quando alguém disser que está vazio, você recebe um aviso.'
                  : 'Quem passa pode avisar se abasteceu ou se está vazio.'}
              </AppText>
            </FormSection>

            <FormSection step={2} title="Onde fica" icon="map-pin">
              <AppText variant="bodySmall" color="textSecondary">
                {manual
                  ? 'Lugar escolhido no mapa.'
                  : located
                    ? 'O mapa abriu onde você está. Arraste até o pote.'
                    : 'Arraste o mapa até o pote.'}
              </AppText>
              <View style={styles.map}>
                <PlacePicker
                  focus={editFocus ?? (manual ? null : located)}
                  accuracyM={manual ? null : (located?.accuracy ?? null)}
                  urgency="low"
                  onOutside={() => setMessage('Por enquanto só aparecem pontos de Belém.')}
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
                label="Endereço ou ponto de referência"
                value={addressText}
                onChangeText={(text) => {
                  setAddressTouched(true);
                  setTyped(text);
                }}
                placeholder="Ex.: Praça Batista Campos, perto do coreto"
                maxLength={ADDRESS_MAX}
              />
              <AppText variant="caption" color="textSecondary">
                Se o pote fica na sua porta, marque na calçada. O mapa não mostra quem cadastrou.
              </AppText>
            </FormSection>

            <FormSection step={3} title="Foto (se puder)" icon="camera">
              <FeedPointPhoto
                token={token}
                currentUrl={initial?.photo?.thumbUrl ?? null}
                onChange={({ key, removed }) => {
                  setPhotoKey(key);
                  setPhotoRemoved(removed);
                }}
                onError={setMessage}
              />
            </FormSection>

            <FormSection step={4} title="Recado (se quiser)" icon="message-square">
              <Input
                label="Observação"
                value={note}
                onChangeText={setNote}
                placeholder="Ex.: abasteço de manhã; o pote de água fica atrás da árvore"
                maxLength={NOTE_MAX}
                multiline
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.chipRail}
              >
                {noteIdeas.map((idea) => (
                  <Chip key={idea} label={idea} onPress={() => setNote(idea)} />
                ))}
              </ScrollView>
            </FormSection>

            <View style={styles.previewHead}>
              <FeedPointPin kind={kind} size={28} />
              <AppText variant="h3">Prévia no mapa</AppText>
            </View>
            <Card elevation="md">
              <FeedPointDetails point={preview} preview compact />
            </Card>

            {message ? <Notice tone="error" message={message} /> : null}
            <Button
              title={
                initial ? 'Salvar mudanças' : verified ? 'Pôr no mapa' : 'Enviar para a equipe'
              }
              icon="send"
              variant="secondary"
              size="lg"
              fullWidth
              loading={sending}
              disabled={!ready}
              onPress={() => void send()}
            />
            <AppText variant="caption" color="textSecondary" style={styles.center}>
              {verified
                ? 'Seu perfil é verificado: o ponto entra no mapa na hora.'
                : 'A equipe confere antes de aparecer no mapa. Venda de animais não é permitida.'}
            </AppText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FormSection({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={[styles.stepDot, { backgroundColor: colors.secondary }]}>
            <AppText variant="bodyStrong" style={{ color: colors.onSecondary }}>
              {step}
            </AppText>
          </View>
          <AppText variant="h3" style={styles.grow}>
            {title}
          </AppText>
          <Icon name={icon} color={colors.primary} />
        </View>
        {children}
      </View>
    </Card>
  );
}

const STEP_DOT = 32;

const styles = StyleSheet.create({
  grow: { flex: 1 },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: {
    width: STEP_DOT,
    height: STEP_DOT,
    borderRadius: STEP_DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  bleed: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  chipRail: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  map: { borderRadius: radius.lg, overflow: 'hidden' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  center: { textAlign: 'center' },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
