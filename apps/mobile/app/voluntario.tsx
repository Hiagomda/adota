import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadMe, messageFrom } from '../src/api';
import { reportError } from '../src/crash/reporter';
import {
  AppText,
  Badge,
  Card,
  Chip,
  Header,
  Notice,
  ProgressBar,
  SectionHeader,
  Skeleton,
  Switch,
} from '../src/components/ui';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';
import { Mascot } from '../src/mascot';
import { useVolunteerAvailability } from '../src/volunteer/availability';
import { badgeArtFor } from '../src/volunteer/badgeArt';
import { LevelUpBanner } from '../src/volunteer/LevelUpBanner';
import { leveledUp } from '../src/volunteer/levelUp';
import { readSeenFloor, writeSeenFloor } from '../src/volunteer/seenLevel';
import type { VolunteerBadge, VolunteerSettings, VolunteerStatus } from '../src/volunteer/types';

const petChoices = [
  { id: 'dog', label: 'Cachorro' },
  { id: 'cat', label: 'Gato' },
  { id: 'other', label: 'Outro' },
] as const;

const dayChoices = [3, 7, 15, 30];

const ROW_MASCOT = 64;
// Three seals per row, leaving room for the gaps.
const SEAL_COLUMN_WIDTH = '29%';
const SEAL_SKELETON = 80;
/** The ranking moves slowly: once every few minutes is enough. */
const RANKING_STALE_MS = 5 * 60 * 1000;

export default function VolunteerScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const foster = useVolunteerAvailability((state) => state.foster);
  const sync = useVolunteerAvailability((state) => state.sync);
  const setFoster = useVolunteerAvailability((state) => state.setFoster);
  const status = useQuery({
    queryKey: ['volunteer', token],
    queryFn: () => api<VolunteerStatus>('/volunteers/me', { token }),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!status.data) return;
    sync(status.data.settings.isFosterAvailable);
  }, [status.data, sync]);

  const [newLevel, setNewLevel] = useState<string | null>(null);
  const levelFloor = status.data?.level.floor;
  const levelName = status.data?.level.name;
  useEffect(() => {
    if (levelFloor === undefined || !levelName) return undefined;
    let active = true;
    readSeenFloor()
      .then(async (seen) => {
        // Leaving before this point keeps the old floor, so the party waits for the next visit.
        if (!active) return;
        if (leveledUp(seen, levelFloor)) setNewLevel(levelName);
        await writeSeenFloor(levelFloor);
      })
      .catch((error: unknown) => {
        reportError(error, { source: 'handled', where: 'volunteer:seen-level' });
      });
    return () => {
      active = false;
    };
  }, [levelFloor, levelName]);

  const ranking = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () =>
      api<{ days: number; neighborhoods: { name: string; rescued: number }[] }>(
        '/stats/neighborhoods',
      ),
    staleTime: RANKING_STALE_MS,
  });
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  // Casa Amiga is reached on WhatsApp only, so an offer without a shown number reaches nobody.
  const reachable = Boolean(me.data?.phone && me.data.whatsappOptIn);

  const save = useMutation({
    mutationFn: (body: VolunteerSettings) =>
      api<VolunteerStatus>('/volunteers/settings', { method: 'PUT', token, body }),
    onSuccess: (next) => {
      client.setQueryData(['volunteer', token], next);
      sync(next.settings.isFosterAvailable);
    },
  });

  function currentSettings(): VolunteerSettings {
    return (
      status.data?.settings ?? {
        isTransportAvailable: false,
        isFosterAvailable: foster,
        fosterPetTypes: ['dog'],
        fosterMaxDays: 7,
        serviceRadiusKm: 10,
      }
    );
  }

  // Until the saved settings arrive, a tap would overwrite them with the defaults.
  const ready = Boolean(status.data);

  function update(patch: Partial<VolunteerSettings>) {
    if (!ready) return;
    const next = { ...currentSettings(), ...patch, isTransportAvailable: false };
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
            {!token ? (
              <Notice message="Entre na sua conta para guardar o que você já fez." />
            ) : null}
            {status.isError ? (
              <Notice
                tone="error"
                message={messageFrom(status.error)}
                action={{ label: 'Tentar de novo', onPress: () => void status.refetch() }}
              />
            ) : null}
            {newLevel ? (
              <LevelUpBanner levelName={newLevel} onClose={() => setNewLevel(null)} />
            ) : null}
            <Card elevation="md">
              {status.isLoading ? (
                <View accessible accessibilityLabel="Carregando seu nível" style={styles.levelBox}>
                  <Skeleton width="45%" height={28} />
                  <Skeleton height={12} radius="pill" />
                  <Skeleton width="60%" height={14} />
                </View>
              ) : (
                <View style={styles.levelBox}>
                  <AppText variant="h2">{level?.name ?? 'Olheiro'}</AppText>
                  <ProgressBar
                    value={level?.progress ?? 0}
                    label="Seu nível"
                    caption={xpCaption}
                    tone="secondary"
                  />
                </View>
              )}
            </Card>
            <Card>
              <View style={styles.row}>
                <Mascot pose="home" size={ROW_MASCOT} />
                <View style={styles.rowText}>
                  <Switch
                    label="Oferecer lar temporário"
                    description="Um canto em casa por alguns dias. Endereço e encontro você combina pelo WhatsApp."
                    value={foster}
                    disabled={!ready}
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
            {foster && me.data && !reachable ? (
              <Notice
                tone="warning"
                message="Quem resgata fala com a Casa Amiga pelo WhatsApp. Salve seu número e ligue Mostrar meu WhatsApp em Ajustes."
                action={{ label: 'Abrir Ajustes', onPress: () => router.push('/settings') }}
              />
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
                        disabled={!ready}
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
                        disabled={!ready}
                        onPress={() => update({ fosterMaxDays: days })}
                      />
                    ))}
                  </View>
                </View>
              </>
            ) : null}
            {save.isError ? <Notice tone="error" message={messageFrom(save.error)} /> : null}
          </View>
          {(ranking.data?.neighborhoods.length ?? 0) > 0 ? (
            <View style={styles.ranking}>
              <SectionHeader
                title="Bairros que mais tiraram animais da rua"
                subtitle={`Nos últimos ${ranking.data?.days ?? 30} dias`}
                flush
              />
              <Card>
                <View style={styles.rankList}>
                  {ranking.data?.neighborhoods.map((place, index, all) => (
                    <ProgressBar
                      key={place.name}
                      value={place.rescued / Math.max(all[0]?.rescued ?? 1, 1)}
                      // Ties share a place: three neighborhoods with one animal are all 1º.
                      label={`${1 + all.filter((other) => other.rescued > place.rescued).length}º ${place.name}`}
                      caption={place.rescued === 1 ? '1 animal' : `${place.rescued} animais`}
                      tone={place.rescued === all[0]?.rescued ? 'secondary' : 'primary'}
                    />
                  ))}
                </View>
              </Card>
            </View>
          ) : null}
          <SectionHeader title="Selos" />
          <View style={styles.grid}>
            {status.isLoading
              ? fallbackBadges.map((badge) => (
                  <View key={badge.code} style={styles.seal}>
                    <Skeleton width={SEAL_SKELETON} height={SEAL_SKELETON} radius="pill" />
                    <Skeleton width="80%" height={12} />
                  </View>
                ))
              : null}
            {(status.isLoading ? [] : (status.data?.badges ?? fallbackBadges)).map((badge) => {
              const Art = badgeArtFor(badge.code);
              if (!Art) return null;
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
  ranking: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingTop: spacing.lg },
  rankList: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingHorizontal: spacing.lg },
  seal: { width: SEAL_COLUMN_WIDTH, alignItems: 'center', gap: spacing.xs },
  sealName: { textAlign: 'center' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
