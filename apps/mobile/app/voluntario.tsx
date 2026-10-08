import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import { useSession } from '../src/session';
import { palette, screenColumn, useTheme } from '../src/theme';
import { Mascot } from '../src/mascot';
import { useVolunteerAvailability } from '../src/volunteer/availability';
import {
  HeroiLocalBadge,
  OlheiroVizinhancaBadge,
  PadrinhoNota10Badge,
  PilotoDoBemBadge,
  PortasAbertasBadge,
} from '../src/volunteer/badges/index';
import type { VolunteerBadge, VolunteerSettings, VolunteerStatus } from '../src/volunteer/types';

const petChoices = [
  { id: 'dog', label: 'Cachorro' },
  { id: 'cat', label: 'Gato' },
  { id: 'other', label: 'Outro' },
] as const;

const dayChoices = [3, 7, 15, 30];
const radiusChoices = [5, 10, 20];

const badgeArt: Record<VolunteerBadge['code'], typeof HeroiLocalBadge> = {
  local_hero: HeroiLocalBadge,
  good_pilot: PilotoDoBemBadge,
  open_doors: PortasAbertasBadge,
  top_sponsor: PadrinhoNota10Badge,
  neighborhood_scout: OlheiroVizinhancaBadge,
};

export default function VolunteerScreen() {
  const theme = useTheme();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.column}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
            <Text style={{ color: theme.text, fontSize: 16 }}>Voltar</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>Sua rede</Text>
          <Text style={[styles.note, { color: theme.muted }]}>
            Cada ajuda na rua fica marcada aqui. Sem pressa, no seu ritmo.
          </Text>
          {!token ? (
            <Text style={[styles.note, { color: theme.muted }]}>
              Entre na sua conta para guardar o que você já fez.
            </Text>
          ) : null}
          {status.isError ? (
            <Text style={[styles.note, { color: theme.muted }]}>{messageFrom(status.error)}</Text>
          ) : null}
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.level, { color: theme.text }]}>{level?.name ?? 'Olheiro'}</Text>
            <Text style={{ color: theme.muted }}>
              {xp} XP
              {level && remaining === null ? ' · você chegou no topo' : ''}
              {remaining !== null ? ` · faltam ${remaining} para o próximo` : ''}
            </Text>
            <View style={[styles.track, { backgroundColor: theme.line }]}>
              <View style={[styles.fill, { width: `${Math.round((level?.progress ?? 0) * 100)}%` }]} />
            </View>
          </View>
          <View style={[styles.row, { backgroundColor: theme.surface }]}>
            <Mascot pose="drive" size={64} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Oferecer transporte</Text>
              <Text style={{ color: theme.muted }}>Levar um animal, no estilo Uber Pet.</Text>
            </View>
            <Switch
              accessibilityLabel="Oferecer transporte"
              value={transport}
              onValueChange={(value) => update({ isTransportAvailable: value })}
              trackColor={{ false: theme.line, true: palette.caju }}
              thumbColor={palette.white}
            />
          </View>
          <View style={[styles.row, { backgroundColor: theme.surface }]}>
            <Mascot pose="home" size={64} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Oferecer lar temporário</Text>
              <Text style={{ color: theme.muted }}>Um canto em casa por alguns dias.</Text>
            </View>
            <Switch
              accessibilityLabel="Oferecer lar temporário"
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
              trackColor={{ false: theme.line, true: palette.caju }}
              thumbColor={palette.white}
            />
          </View>
          {transport || foster ? (
            <View style={styles.block}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Até onde você chega</Text>
              <View style={styles.chips}>
                {radiusChoices.map((km) => {
                  const selected = currentSettings().serviceRadiusKm === km;
                  return (
                    <Pressable
                      key={km}
                      accessibilityRole="button"
                      onPress={() => update({ serviceRadiusKm: km })}
                      style={[styles.chip, selected ? styles.chipOn : { backgroundColor: theme.surface }]}
                    >
                      <Text style={{ color: selected ? palette.acai : theme.text }}>{km} km</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {foster ? (
            <View style={styles.block}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Quem você acolhe</Text>
              <View style={styles.chips}>
                {petChoices.map((pet) => {
                  const selected = currentSettings().fosterPetTypes.includes(pet.id);
                  return (
                    <Pressable
                      key={pet.id}
                      accessibilityRole="button"
                      onPress={() => togglePet(pet.id)}
                      style={[styles.chip, selected ? styles.chipOn : { backgroundColor: theme.surface }]}
                    >
                      <Text style={{ color: selected ? palette.acai : theme.text }}>{pet.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.rowTitle, { color: theme.text }]}>Por quantos dias</Text>
              <View style={styles.chips}>
                {dayChoices.map((days) => {
                  const selected = currentSettings().fosterMaxDays === days;
                  return (
                    <Pressable
                      key={days}
                      accessibilityRole="button"
                      onPress={() => update({ fosterMaxDays: days })}
                      style={[styles.chip, selected ? styles.chipOn : { backgroundColor: theme.surface }]}
                    >
                      <Text style={{ color: selected ? palette.acai : theme.text }}>{days} dias</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {save.isError ? (
            <Text style={[styles.note, { color: theme.muted }]}>{messageFrom(save.error)}</Text>
          ) : null}
          <Text style={[styles.level, { color: theme.text }]}>Selos</Text>
          <View style={styles.grid}>
            {(status.data?.badges ?? fallbackBadges).map((badge) => {
              const Art = badgeArt[badge.code];
              const unlocked = badge.unlockedAt !== null;
              return (
                <View key={badge.code} style={styles.seal}>
                  <Art unlocked={unlocked} />
                  <Text style={[styles.sealName, { color: theme.text }]}>{badge.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    {unlocked ? 'Seu' : 'Ainda não'}
                  </Text>
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
  screen: { paddingBottom: 32 },
  column: { ...screenColumn, padding: 16, gap: 14 },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700' },
  note: { fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 16, padding: 16, gap: 8 },
  level: { fontSize: 20, fontWeight: '700' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 999, backgroundColor: palette.caju },
  row: {
    minHeight: 72,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  block: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: palette.caju },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  seal: { width: '30%', alignItems: 'center', gap: 6 },
  sealName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
