import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, loadMe, loadPost } from '../src/api';
import {
  AppText,
  Button,
  Chip,
  Header,
  Icon,
  IconButton,
  Input,
  Notice,
  Touchable,
} from '../src/components/ui';
import { reportError } from '../src/crash/reporter';
import type { MapPoint } from '../src/map/geo';
import { insideServiceArea } from '../src/map/serviceArea';
import { useAddress, placeLabel } from '../src/place/address';
import { useAnimalGps } from '../src/place/gps';
import { PlacePicker } from '../src/place/PlacePicker';
import { isOfflineError, preparePhoto, publishAlert } from '../src/place/publish';
import { permissionOutcome } from '../src/permissions';
import { useSession } from '../src/session';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';
import type { Post } from '../src/types';

const helpKinds = [
  { value: 'food', label: 'Ração' },
  { value: 'vet', label: 'Veterinário' },
  { value: 'castration', label: 'Castração' },
] as const;

const speciesOptions = [
  { value: 'dog', label: 'Cachorro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Outro' },
] as const;

const sizeOptions = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
] as const;

const MAX_PHOTOS = 5;

function parseGoal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

export default function DonateScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const gps = useAnimalGps();
  const [photos, setPhotos] = useState<string[]>([]);
  const [helpKind, setHelpKind] = useState<'food' | 'vet' | 'castration'>('food');
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other'>('dog');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [description, setDescription] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [goal, setGoal] = useState('');
  const [manual, setManual] = useState<MapPoint | null>(null);
  const [moved, setMoved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = moved ? manual : located;
  const { address } = useAddress(point);

  const addPhoto = useCallback((uri: string) => {
    setPhotos((current) => {
      if (current.length >= MAX_PHOTOS || current.includes(uri)) return current;
      preparePhoto(uri);
      return [...current, uri];
    });
  }, []);

  function pickFromLibrary() {
    void (async () => {
      if (Platform.OS !== 'web') {
        const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
        if (outcome !== 'granted') {
          setMessage('Preciso da galeria para anexar a foto.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
      if (uri) addPhoto(uri);
    })().catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'doar:gallery' });
      setMessage('Não consegui abrir a galeria. Tente de novo.');
    });
  }

  async function publish() {
    if (!token) {
      router.push({ pathname: '/login', params: { returnTo: '/doar' } });
      return;
    }
    if (!me.data?.verified) {
      setMessage('Só um perfil verificado pode publicar um pedido com Pix.');
      return;
    }
    const pix = pixKey.trim();
    if (photos.length === 0 || description.trim().length === 0 || pix.length === 0) {
      setMessage('Coloque uma foto, o que você precisa e a chave Pix.');
      return;
    }
    if (goal.trim() && parseGoal(goal) === null) {
      setMessage('A meta precisa ser um valor, por exemplo 150 ou 150,00.');
      return;
    }
    if (!point || !insideServiceArea(point)) {
      setMessage('Esse ponto fica fora de Belém. Escolha um lugar dentro da área verde.');
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const created = await publishAlert({
        id: `${Date.now()}`,
        token,
        photos,
        description: description.trim(),
        kind: 'help_request',
        species,
        size,
        sex: 'unknown',
        name: '',
        urgency: 'medium',
        point,
        accuracyM: gps.fix?.accuracy ?? null,
        addressText: address,
        referencePoint: '',
        approxLabel: placeLabel(point, address),
        helpRequest: {
          kind: helpKind,
          pixKey: pix,
          goalAmount: parseGoal(goal),
        },
      });
      const fresh = await loadPost(created.id, token).catch(() => null);
      if (fresh) {
        client.setQueryData(
          ['home-campaigns', token],
          (current: { posts: Post[]; nextCursor: string | null } | undefined) => ({
            posts: [fresh, ...(current?.posts ?? []).filter((item) => item.id !== fresh.id)],
            nextCursor: current?.nextCursor ?? null,
          }),
        );
      }
      void client.invalidateQueries({ queryKey: ['home-campaigns'] });
      void client.invalidateQueries({ queryKey: ['posts'] });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      router.replace(`/post/${created.id}`);
    } catch (error) {
      if (isOfflineError(error)) {
        setMessage('Sem internet. O pedido de doação precisa de conexão para publicar.');
        return;
      }
      setMessage(error instanceof ApiError ? error.message : 'Não consegui publicar. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.column}>
        <Header title="Doar" onBack={() => router.back()} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.giant }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <AppText color="textSecondary">
            O pedido mostra a chave Pix do perfil verificado. O app não recebe nem repassa dinheiro.
          </AppText>
          {!token ? (
            <Button
              title="Entrar para pedir doação"
              icon="log-in"
              fullWidth
              onPress={() => router.push({ pathname: '/login', params: { returnTo: '/doar' } })}
            />
          ) : me.isLoading ? (
            <AppText color="textSecondary">Carregando seu perfil…</AppText>
          ) : me.isError || !me.data ? (
            <Notice message="Não consegui carregar seu perfil. Volte e tente de novo." />
          ) : !me.data.verified ? (
            <>
              <Notice message="Só perfil verificado pode publicar um pedido com Pix. Peça a verificação em Ajustes." />
              <Button
                title="Pedir verificação"
                icon="shield"
                variant="outline"
                fullWidth
                onPress={() => router.push('/settings')}
              />
            </>
          ) : (
            <>
              <View style={styles.group}>
                <AppText variant="bodyStrong">O que precisa</AppText>
                <View style={styles.chips}>
                  {helpKinds.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={helpKind === option.value}
                      onPress={() => setHelpKind(option.value)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.grid}>
                {photos.map((photo) => (
                  <View key={photo} style={styles.thumbWrap}>
                    <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
                    <IconButton
                      icon="x"
                      variant="filled"
                      accessibilityLabel="Remover esta foto"
                      onPress={() => setPhotos((current) => current.filter((item) => item !== photo))}
                      style={styles.removePhoto}
                    />
                  </View>
                ))}
                {photos.length < MAX_PHOTOS ? (
                  <Touchable
                    accessibilityRole="button"
                    accessibilityLabel="Escolher foto da galeria"
                    pressedScale={0.96}
                    onPress={pickFromLibrary}
                    style={[styles.add, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <Icon name="image" size="lg" color={colors.onPrimarySoft} />
                  </Touchable>
                ) : null}
              </View>
              <View style={styles.group}>
                <AppText variant="bodyStrong">Espécie</AppText>
                <View style={styles.chips}>
                  {speciesOptions.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={species === option.value}
                      onPress={() => setSpecies(option.value)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.group}>
                <AppText variant="bodyStrong">Porte</AppText>
                <View style={styles.chips}>
                  {sizeOptions.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={size === option.value}
                      onPress={() => setSize(option.value)}
                    />
                  ))}
                </View>
              </View>
              <Input
                label="O que você precisa"
                multiline
                value={description}
                onChangeText={setDescription}
                placeholder="Ex.: ração para os cães do abrigo esta semana"
              />
              <Input
                label="Chave Pix"
                value={pixKey}
                onChangeText={setPixKey}
                placeholder="E-mail, telefone, CPF ou aleatória"
                autoCapitalize="none"
                maxLength={120}
                helper="Aparece no pedido. O pagamento acontece fora do app."
              />
              <Input
                label="Meta (opcional)"
                value={goal}
                onChangeText={setGoal}
                placeholder="150,00"
                keyboardType="decimal-pad"
              />
              <AppText variant="bodySmall" color="textSecondary">
                {point ? placeLabel(point, address) : gps.message}
              </AppText>
              <View style={styles.map}>
                <PlacePicker
                  focus={moved ? null : located}
                  accuracyM={moved ? null : (located?.accuracy ?? null)}
                  urgency="low"
                  onOutside={() =>
                    setMessage('Esse ponto fica fora de Belém. O mapa só libera a cidade e a região em volta.')
                  }
                  onChange={(next, fromUser) => {
                    if (!fromUser || !insideServiceArea(next)) return;
                    setMoved(true);
                    setManual(next);
                    setMessage(null);
                  }}
                />
              </View>
              {message ? <Notice message={message} /> : null}
              <Button
                title={pending ? 'Publicando...' : 'Publicar pedido'}
                icon="gift"
                size="lg"
                loading={pending}
                fullWidth
                disabled={pending}
                onPress={() => void publish()}
              />
            </>
          )}
          {message && (!token || !me.data?.verified) ? <Notice message={message} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { ...screenColumn },
  content: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { width: 96, height: 120, borderRadius: radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  add: {
    width: 96,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: { borderRadius: radius.lg, overflow: 'hidden' },
});

export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
