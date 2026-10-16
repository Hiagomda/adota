import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import { AppText, Button, Header, Input, Notice, useToast } from '../../src/components/ui';
import type { MapPoint } from '../../src/map/geo';
import { insideServiceArea } from '../../src/map/serviceArea';
import { useAnimalGps } from '../../src/place/gps';
import { PlacePicker } from '../../src/place/PlacePicker';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const NOTE_MAX = 200;

/** "Vi esse animal": marks where someone saw it, without promising to go. */
export default function SightingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const gps = useAnimalGps();
  const [manual, setManual] = useState<MapPoint | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = manual ?? located;

  async function send() {
    if (!token) {
      setMessage('Entre na sua conta para marcar onde viu o animal.');
      return;
    }
    if (!point) {
      setMessage('Mova o mapa até onde você viu o animal.');
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      await api(`/posts/${id}/sightings`, {
        method: 'POST',
        token,
        body: {
          latitude: point.latitude,
          longitude: point.longitude,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      await client.invalidateQueries({ queryKey: ['sightings', id] });
      toast.show('Obrigado! Avisamos quem está cuidando deste resgate.', 'success');
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
          <Header title="Vi esse animal" onBack={() => router.back()} />
          <View style={styles.body}>
            <AppText color="textSecondary">
              Marque onde você viu. Você não precisa ir até lá: quem está cuidando recebe o aviso.
            </AppText>
            <AppText variant="bodySmall" color="textSecondary">
              {manual ? 'Ponto escolhido no mapa.' : gps.message}
            </AppText>
            {gps.action ? (
              <Button
                title={gps.action.label}
                icon="settings"
                variant="ghost"
                onPress={() => void gps.action?.run()}
              />
            ) : null}
            <View style={styles.map}>
              <PlacePicker
                focus={manual ? null : located}
                accuracyM={manual ? null : (located?.accuracy ?? null)}
                urgency="medium"
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
            <Button
              title="Usar minha localização atual"
              icon="crosshair"
              variant="outline"
              fullWidth
              onPress={() => {
                setManual(null);
                void gps.retry();
              }}
            />
            <Input
              label="Como ele estava? (se quiser)"
              value={note}
              onChangeText={setNote}
              placeholder="Ex.: perto da padaria, mancando da pata da frente"
              maxLength={NOTE_MAX}
              multiline
              helper={`${note.length}/${NOTE_MAX}. No app aparece só o bairro para quem não está ajudando.`}
            />
            {message ? <Notice tone="error" message={message} /> : null}
            <Button
              title="Marcar que vi"
              icon="eye"
              variant="secondary"
              size="lg"
              fullWidth
              loading={sending}
              disabled={!point}
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
