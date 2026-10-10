import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Badge,
  Card,
  Chip,
  Header,
  Notice,
  ProgressBar,
  SectionHeader,
  Switch,
} from '../src/components/ui';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';
import { Mascot } from '../src/mascot';
import { useVolunteerAvailability } from '../src/volunteer/availability';
import { badgeArt } from '../src/volunteer/badgeArt';
import type { VolunteerBadge, VolunteerSettings, VolunteerStatus } from '../src/volunteer/types';

const petChoices = [
  { id: 'dog', label: 'Cachorro' },
  { id: 'cat', label: 'Gato' },
  { id: 'other', label: 'Outro' },
] as const;

const dayChoices = [3, 7, 15, 30];
const radiusChoices = [5, 10, 20];

const ROW_MASCOT = 64;
// Three seals per row, leaving room for the gaps.
const SEAL_COLUMN_WIDTH = '29%';

export default function VolunteerScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const transport = useVolunteerAvailability((state) => state.transport);
  const foster = useVolunteerAvailability((state) => state.foster);
  const sync = useVolunteerAvailability((state) => state.sync);
  const setTransport = useVolunteerAvailability((state) => state.setTransport);
  const setFoster = useVolunteerAvailability((state) => state.setFoster);
  const status = useQuery({
    queryKey: ['volunteer', token],
    queryFn: () => api<VolunteerStatus>('/volunteers/me', { token }),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!status.data) return;
    sync(status.data.settings.isTransportAvailable, status.data.settings.isFosterAvailable);
  }, [status.data, sync]);

  const save = useMutation({
    mutationFn: (body: VolunteerSettings) =>
      api<VolunteerStatus>('/volunteers/settings', { method: 'PUT', token, body }),
    onSuccess: (next) => {
      client.setQueryData(['volunteer', token], next);
      sync(next.settings.isTransportAvailable, next.settings.isFosterAvailable);
    },
  });

  function currentSettings(): VolunteerSettings {
    return (
      status.data?.settings ?? {
        isTransportAvailable: transport,
        isFosterAvailable: foster,
        fosterPetTypes: ['dog'],
        fosterMaxDays: 7,
        serviceRadiusKm: 10,
      }
    );
  }

  function update(patch: Partial<VolunteerSettings>) {
    const next = { ...currentSettings(), ...patch };
    if (patch.isTransportAvailable !== undefined) setTransport(patch.isTransportAvailable);
    if (patch.isFosterAvailable !== undefined) setFoster(patch.isFosterAvailable);
    save.mutate(next);
  }

  function togglePet(id: 'dog' | 'cat' | 'other') {
    const current = currentSettings();
    const has = current.fosterPetTypes.includes(id);
    const fosterPetTypes = has
      ? current.fosterPetTypes.filter((item) => item !== id)
      : [...current.fosterPetTypes, id];
    if (fosterPetTypes.length === 0) return;
    update({ fosterPetTypes });
  }

  const level = status.data?.level;
  const xp = status.data?.xp ?? 0;
  const remaining = level && level.ceiling !== null ? Math.max(level.ceiling - xp, 0) : null;
  const xpCaption = `${xp} XP${level && remaining === null ? ' · você chegou no topo' : ''}${
    remaining !== null ? ` · faltam ${remaining} para o próximo` : ''
  }`;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Header title="Sua rede" large onBack={() => router.back()} />
          <View style={styles.body}>
            <AppText color="textSecondary">
              Cada ajuda na rua fica marcada aqui. Sem pressa, no seu ritmo.
            </AppText>
            {!token ? <Notice message="Entre na sua conta para guardar o que você já fez." /> : null}
            {status.isError ? <Notice tone="error" message={messageFrom(status.error)} /> : null}
            <Card elevation="md">
              <View style={styles.levelBox}>
                <AppText variant="h2">{level?.name ?? 'Olheiro'}</AppText>
                <ProgressBar
                  value={level?.progress ?? 0}
                  label="Seu nível"
                  caption={xpCaption}
                  tone="secondary"
                />
              </View>
            </Card>
            <Card>
              <View style={styles.row}>
                <Mascot pose="drive" size={ROW_MASCOT} />
                <View style={styles.rowText}>
                  <Switch
                    label="Oferecer transporte"
                    description="Levar um animal, no estilo Uber Pet."
                    value={transport}
                    onValueChange={(value) => update({ isTransportAvailable: value })}
                  />
                </View>
              </View>
            </Card>
            <Card>
              <View style={styles.row}>
                <Mascot pose="home" size={ROW_MASCOT} />
                <View style={styles.rowText}>
                  <Switch
                    label="Oferecer lar temporário"
                    description="Um canto em casa por alguns dias."
                    value={foster}
                    onValueChange={(value) =>
                      update({
                        isFosterAvailable: value,
                        fosterPetTypes: currentSettings().fosterPetTypes.length
                          ? currentSettings().fosterPetTypes
                          : ['dog'],
                        fosterMaxDays: currentSettings().fosterMaxDays ?? 7,
                      })
                    }
                  />
                </View>
              </View>
            </Card>
            {transport || foster ? (
              <View style={styles.block}>
                <AppText variant="h3">Até onde você chega</AppText>
                <View style={styles.chips}>
                  {radiusChoices.map((km) => (
                    <Chip
                      key={km}
                      label={`${km} km`}
                      selected={currentSettings().serviceRadiusKm === km}
                      onPress={() => update({ serviceRadiusKm: km })}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {foster ? (
              <>
                <View style={styles.block}>
                  <AppText variant="h3">Quem você acolhe</AppText>
                  <View style={styles.chips}>
                    {petChoices.map((pet) => (
                      <Chip
                        key={pet.id}
                        label={pet.label}
                        selected={currentSettings().fosterPetTypes.includes(pet.id)}
                        onPress={() => togglePet(pet.id)}
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
                        selected={currentSettings().fosterMaxDays === days}
                        onPress={() => update({ fosterMaxDays: days })}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}
            {save.isError ? <Notice tone="error" message={messageFrom(save.error)} /> : null}
          </View>
          <SectionHeader title="Selos" />
          <View style={styles.grid}>
            {(status.data?.badges ?? fallbackBadges).map((badge) => {
              const Art = badgeArt[badge.code];
              const unlocked = badge.unlockedAt !== null;
              return (
                <View
                  key={badge.code}
                  accessible
                  accessibilityLabel={`${badge.name}, ${unlocked ? 'conquistado' : 'ainda não conquistado'}`}
                  style={styles.seal}
                >
                  <Art unlocked={unlocked} />
                  <AppText variant="caption" style={styles.sealName}>
                    {badge.name}
                  </AppText>
                  <Badge
                    kind="label"
                    label={unlocked ? 'Seu' : 'Ainda não'}
                    tone={unlocked ? 'success' : 'neutral'}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const fallbackBadges: VolunteerBadge[] = [
  { code: 'local_hero', name: 'Herói local', unlockedAt: null },
  { code: 'good_pilot', name: 'Piloto do bem', unlockedAt: null },
  { code: 'open_doors', name: 'Portas abertas', unlockedAt: null },
  { code: 'top_sponsor', name: 'Padrinho nota 10', unlockedAt: null },
  { code: 'neighborhood_scout', name: 'Olheiro da vizinhança', unlockedAt: null },
];

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  levelBox: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingHorizontal: spacing.lg },
  seal: { width: SEAL_COLUMN_WIDTH, alignItems: 'center', gap: spacing.xs },
  sealName: { textAlign: 'center' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
