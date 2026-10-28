import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  Input,
  Notice,
  ProgressBar,
  Segmented,
  SkeletonRows,
  Switch,
  useToast,
} from '../src/components/ui';
import { useWhatsAppContact } from '../src/contact/useWhatsAppContact';
import { StayCard } from '../src/fosterHome/StayCard';
import {
  offerLabels,
  petChoices,
  sizeChoices,
  slotsLabel,
  toggleChoice,
  type FosterHomeSettings,
  type FosterOffer,
  type FosterStay,
  type MyFosterHome,
  type StayAction,
} from '../src/fosterHome/fosterHome';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';
import { useVolunteerAvailability } from '../src/volunteer/availability';

const dayChoices = [3, 7, 15, 30, 60];
const capacityChoices = [1, 2, 3, 4, 5];
const offerChoices: FosterOffer[] = ['food', 'supplies', 'vet'];

type Tab = 'received' | 'sent' | 'home';

/** A Casa Amiga da pessoa: vagas, o que ela aceita e os pedidos de acolhimento. */
export default function FosterHomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [tab, setTab] = useState<Tab>('received');
  const [busy, setBusy] = useState<string | null>(null);
  const whatsapp = useWhatsAppContact(token, (message) => toast.show(message, 'error'));
  const home = useQuery({
    queryKey: ['casa-amiga', token],
    queryFn: () => api<MyFosterHome>('/me/casa-amiga', { token }),
    enabled: Boolean(token),
  });
  const data = home.data;
  const pending = data?.received.filter((stay) => stay.status === 'requested').length ?? 0;

  async function act(stay: FosterStay, action: StayAction) {
    if (busy) return;
    setBusy(`${stay.id}:${action}`);
    try {
      const result = await api<{ status: string; postStatusChanged: boolean }>(
        `/foster-stays/${stay.id}/${action}`,
        { method: 'POST', token, body: {} },
      );
      await client.invalidateQueries({ queryKey: ['casa-amiga'] });
      await client.invalidateQueries({ queryKey: ['post', stay.post.id] });
      await client.invalidateQueries({ queryKey: ['volunteer'] });
      const messages: Record<StayAction, string> = {
        approve: result.postStatusChanged
          ? 'Acolhimento aceito. O resgate agora está em lar temporário.'
          : 'Acolhimento aceito. Avisamos quem pediu.',
        decline: 'Pedido recusado. Avisamos quem pediu, sem julgamento.',
        cancel: 'Acolhimento cancelado.',
        end: 'Acolhimento encerrado. Os dias entram no seu XP.',
      };
      toast.show(messages[action], 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setBusy(null);
    }
  }

  function talk(stay: FosterStay, side: 'foster' | 'requester') {
    const other = side === 'foster' ? stay.requester?.name : stay.foster.name;
    const first = other?.split(' ')[0] ?? '';
    void whatsapp.open(
      `/foster-stays/${stay.id}/contact`,
      `Oi${first ? `, ${first}` : ''}! Sobre o acolhimento combinado no Égua, adota!: vamos acertar a entrega?`,
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <Header title="Casa Amiga" onBack={() => router.back()} />
          <EmptyState
            pose="home"
            title="Entre para abrir sua Casa Amiga"
            body="Com a conta você recebe pedidos de lar temporário e acompanha os acolhimentos."
            actionLabel="Entrar"
            onAction={() => router.push('/login')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={home.isRefetching}
            onRefresh={() => void home.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header title="Casa Amiga" large onBack={() => router.back()} />
          {home.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : home.isError || !data ? (
            <ErrorState
              title="Não consegui abrir sua Casa Amiga"
              body={messageFrom(home.error)}
              onRetry={() => void home.refetch()}
            />
          ) : (
            <View style={styles.body}>
              <Card elevation="md">
                <View style={styles.slots}>
                  <AppText variant="h3">
                    {data.settings.isFosterAvailable
                      ? 'Sua casa está aberta'
                      : 'Sua casa está fechada'}
                  </AppText>
                  <ProgressBar
                    value={data.slots.capacity > 0 ? data.slots.occupied / data.slots.capacity : 0}
                    label="Vagas ocupadas"
                    caption={slotsLabel(data.slots.free, data.slots.capacity)}
                    tone="primary"
                  />
                </View>
              </Card>
              <Segmented
                accessibilityLabel="O que ver na Casa Amiga"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'received', label: pending > 0 ? `Pedidos (${pending})` : 'Pedidos' },
                  { value: 'sent', label: 'Que pedi' },
                  { value: 'home', label: 'Minha casa' },
                ]}
              />
              {tab === 'received' ? (
                data.received.length === 0 ? (
                  <EmptyState
                    compact
                    pose="home"
                    title="Nenhum pedido ainda"
                    body={
                      data.settings.isFosterAvailable
                        ? 'Quando alguém precisar de lar temporário perto de você, o pedido chega aqui e no aviso.'
                        : 'Abra sua casa em Minha casa para aparecer para quem resgata.'
                    }
                  />
                ) : (
                  data.received.map((stay) => (
                    <StayCard
                      key={stay.id}
                      stay={stay}
                      side="foster"
                      busy={busy}
                      contactBusy={whatsapp.busy === `/foster-stays/${stay.id}/contact`}
                      onAction={(action) => void act(stay, action)}
                      onOpenPost={() => router.push(`/post/${stay.post.id}`)}
                      onTalk={() => talk(stay, 'foster')}
                    />
                  ))
                )
              ) : null}
              {tab === 'sent' ? (
                data.sent.length === 0 ? (
                  <EmptyState
                    compact
                    pose="search"
                    title="Você não pediu acolhimento"
                    body="No post de um resgate, depois de dizer que vai ajudar, aparecem as Casas Amigas com vaga perto dele."
                  />
                ) : (
                  data.sent.map((stay) => (
                    <StayCard
                      key={stay.id}
                      stay={stay}
                      side="requester"
                      busy={busy}
                      contactBusy={whatsapp.busy === `/foster-stays/${stay.id}/contact`}
                      onAction={(action) => void act(stay, action)}
                      onOpenPost={() => router.push(`/post/${stay.post.id}`)}
                      onTalk={() => talk(stay, 'requester')}
                    />
                  ))
                )
              ) : null}
              {tab === 'home' ? (
                <HomeForm
                  key="home-form"
                  initial={data.settings}
                  hasArea={data.hasArea}
                  reachable={data.reachable}
                  token={token}
                  onSaved={async (settings) => {
                    useVolunteerAvailability.getState().sync(settings.isFosterAvailable);
                    await client.invalidateQueries({ queryKey: ['casa-amiga'] });
                    await client.invalidateQueries({ queryKey: ['volunteer'] });
                    toast.show('Casa Amiga salva.', 'success');
                  }}
                  onSettings={() => router.push('/settings')}
                />
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeForm({
  initial,
  hasArea,
  reachable,
  token,
  onSaved,
  onSettings,
}: {
  initial: FosterHomeSettings;
  hasArea: boolean;
  reachable: boolean;
  token: string;
  onSaved: (settings: FosterHomeSettings) => Promise<void>;
  onSettings: () => void;
}) {
  const [form, setForm] = useState<FosterHomeSettings>(() => ({
    ...initial,
    fosterPetTypes: initial.fosterPetTypes.length ? initial.fosterPetTypes : ['dog'],
    fosterMaxDays: initial.fosterMaxDays ?? 7,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(next: Partial<FosterHomeSettings>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api('/me/casa-amiga', {
        method: 'PUT',
        token,
        body: { ...form, notes: form.notes?.trim() ? form.notes.trim() : null },
      });
      await onSaved(form);
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <Switch
        label="Receber pedidos de lar temporário"
        description="Desligada, sua casa some da lista. Os acolhimentos em andamento continuam."
        value={form.isFosterAvailable}
        onValueChange={(value) => patch({ isFosterAvailable: value })}
      />
      {!hasArea ? (
        <Notice
          tone="info"
          message="Sem uma região salva, sua casa aparece sem distância. Ela é salva quando você abre o app com a localização liberada e nunca é mostrada a ninguém."
        />
      ) : null}
      {!reachable ? (
        <Notice
          tone="info"
          message="Os pedidos chegam pelo app. Se quiser combinar a entrega pelo WhatsApp, salve seu número em Ajustes."
          action={{ label: 'Abrir Ajustes', onPress: onSettings }}
        />
      ) : null}
      <View style={styles.block}>
        <AppText variant="h3">Quem você acolhe</AppText>
        <View style={styles.chips}>
          {petChoices.map((pet) => (
            <Chip
              key={pet.id}
              label={pet.label}
              selected={form.fosterPetTypes.includes(pet.id)}
              onPress={() =>
                patch({ fosterPetTypes: toggleChoice(form.fosterPetTypes, pet.id, true) })
              }
            />
          ))}
        </View>
      </View>
      <View style={styles.block}>
        <AppText variant="h3">Portes</AppText>
        <View style={styles.chips}>
          {sizeChoices.map((choice) => (
            <Chip
              key={choice.id}
              label={choice.label}
              selected={form.fosterSizes.includes(choice.id)}
              onPress={() =>
                patch({ fosterSizes: toggleChoice(form.fosterSizes, choice.id, true) })
              }
            />
          ))}
        </View>
      </View>
      <View style={styles.block}>
        <AppText variant="h3">Quantos ao mesmo tempo</AppText>
        <View style={styles.chips}>
          {capacityChoices.map((value) => (
            <Chip
              key={value}
              label={value === 1 ? '1 animal' : `${value} animais`}
              selected={form.capacity === value}
              onPress={() => patch({ capacity: value })}
            />
          ))}
        </View>
      </View>
      <View style={styles.block}>
        <AppText variant="h3">Por quantos dias</AppText>
        <View style={styles.chips}>
          {dayChoices.map((days) => (
            <Chip
              key={days}
              label={`${days} dias`}
              selected={form.fosterMaxDays === days}
              onPress={() => patch({ fosterMaxDays: days })}
            />
          ))}
        </View>
      </View>
      <Switch
        label="Aceito animal com necessidades especiais"
        description="Pós-cirurgia, remédio em horário certo, idoso ou com deficiência."
        value={form.acceptsSpecialNeeds}
        onValueChange={(value) => patch({ acceptsSpecialNeeds: value })}
      />
      <View style={styles.block}>
        <AppText variant="h3">Também posso oferecer</AppText>
        <View style={styles.chips}>
          {offerChoices.map((offer) => (
            <Chip
              key={offer}
              label={offerLabels[offer]}
              selected={form.offers.includes(offer)}
              onPress={() => patch({ offers: toggleChoice(form.offers, offer) })}
            />
          ))}
        </View>
      </View>
      <Input
        label="Recado para quem pede (opcional)"
        placeholder="Ex.: quintal cercado, já tenho uma gata"
        value={form.notes ?? ''}
        onChangeText={(value) => patch({ notes: value })}
        multiline
        maxLength={300}
      />
      {error ? <Notice tone="error" message={error} /> : null}
      <Button title="Salvar Casa Amiga" fullWidth loading={saving} onPress={() => void save()} />
      <AppText variant="caption" color="textSecondary">
        Seu endereço nunca aparece. Quem procura vê só a distância aproximada, em km, e vocês
        combinam o encontro depois do aceite.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  slots: { gap: spacing.md },
  form: { gap: spacing.lg },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
