import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import { AppText, Button, Chip, Header, Input, Notice, useToast } from '../../src/components/ui';
import { fairDays, fairDurations, fairRange, fairStartHours } from '../../src/events/fairs';
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

/** Divulgar feira de adoção: só ONG ou protetor verificado chega aqui (a API confere de novo). */
export default function NewFairScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const gps = useAnimalGps();
  const days = useMemo(() => fairDays(), []);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [hours, setHours] = useState(4);
  const [manual, setManual] = useState<MapPoint | null>(null);
  const [typed, setTyped] = useState('');
  const [placeTouched, setPlaceTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = manual ?? located;
  const { address } = useAddress(point);

  // O endereço do pino sugere o nome do lugar até a pessoa escrever o dela.
  const suggested = point && address ? placeLabel(point, address).slice(0, PLACE_MAX) : '';
  const place = placeTouched ? typed : suggested;

  const ready = title.trim().length >= 3 && day && startHour !== null && point && place.trim();

  async function send() {
    if (!token) {
      setMessage('Entre na sua conta para divulgar a feira.');
      return;
    }
    if (!ready || !day || startHour === null || !point) {
      setMessage('Preencha o nome, o dia, o horário e o lugar da feira.');
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const range = fairRange(day, startHour, hours);
      await api('/adoption-events', {
        method: 'POST',
        token,
        body: {
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          placeLabel: place.trim(),
          latitude: point.latitude,
          longitude: point.longitude,
          ...range,
        },
      });
      await client.invalidateQueries({ queryKey: ['adoption-events'] });
      toast.show('Feira divulgada! Ela aparece no Início e em Feiras de adoção.', 'success');
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
          <Header title="Divulgar feira" onBack={() => router.back()} />
          <View style={styles.body}>
            <Input
              label="Nome da feira"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex.: Feira de adoção na Batista Campos"
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

            <AppText variant="bodyStrong">Começa às</AppText>
            <View style={styles.wrap}>
              {fairStartHours.map((hour) => (
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
              {fairDurations.map((option) => (
                <Chip
                  key={option}
                  label={`${option} horas`}
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
                  ? 'O mapa abriu onde você está. Arraste até o lugar da feira.'
                  : 'Arraste o mapa até o lugar da feira.'}
            </AppText>
            <View style={styles.map}>
              <PlacePicker
                focus={manual ? null : located}
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
              placeholder="Ex.: Praça Batista Campos, perto do coreto"
              maxLength={PLACE_MAX}
              helper="A feira é em lugar público: o ponto aparece exato para todo mundo."
            />
            <Input
              label="O que levar ou saber (se quiser)"
              value={description}
              onChangeText={setDescription}
              placeholder="Ex.: animais castrados e vacinados, traga documento com foto"
              maxLength={DESCRIPTION_MAX}
              multiline
            />
            {message ? <Notice tone="error" message={message} /> : null}
            <Button
              title="Divulgar feira"
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

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
