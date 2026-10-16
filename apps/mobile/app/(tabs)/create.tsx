import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api, loadPost } from '../../src/api';
import { reportError } from '../../src/crash/reporter';
import {
  AppText,
  Button,
  Chip,
  Icon,
  IconButton,
  Input,
  Notice,
  SectionHeader,
  Segmented,
  Touchable,
} from '../../src/components/ui';
import type { MapPoint } from '../../src/map/geo';
import { insideServiceArea } from '../../src/map/serviceArea';
import { useAddress, placeLabel } from '../../src/place/address';
import { useAnimalGps } from '../../src/place/gps';
import {
  openCreateCamera,
  peekInitialCreateShot,
  setCreatePhotoCount,
  watchCreateCamera,
} from '../../src/createCamera';
import { Mascot } from '../../src/mascot';
import { enqueueAlert } from '../../src/place/outbox';
import { openAppSettings, openSettingsLabel, permissionOutcome } from '../../src/permissions';
import { PlacePicker } from '../../src/place/PlacePicker';
import { isOfflineError, preparePhoto, publishAlert } from '../../src/place/publish';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';
import type { Post } from '../../src/types';
import { logBestEffort } from '../../src/crash/bestEffort';
import { ageBands, careKeys, careQuestion, type AgeBand, type CareKey } from '../../src/post/care';

const suggestions = [
  'Está na rua e precisa de resgate agora.',
  'Parece machucado e não consegue andar.',
  'Está preso e precisa de ajuda para sair.',
  'Filhotes sozinhos, sem a mãe por perto.',
];

const kindOptions = [
  { value: 'rescue_alert', label: 'Resgate' },
  { value: 'lost', label: 'Perdido' },
  { value: 'adoption', label: 'Adoção' },
] as const;

const adoptionSuggestions = [
  'Já está em casa e procura um lar definitivo.',
  'Vacinado e castrado, pronto para adoção.',
  'Dócil com pessoas e outros animais.',
  'Filhote que precisa de uma família.',
];

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

const sexOptions = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Fêmea' },
  { value: 'unknown', label: 'Não sei' },
] as const;

const urgencyOptions = [
  { value: 'high', label: 'Urgente' },
  { value: 'medium', label: 'Atenção' },
  { value: 'low', label: 'Pode esperar' },
] as const;

const MAX_PHOTOS = 5;
const MIN_COLUMN_WIDTH = 280;
const INTRO_MASCOT = 72;
const THUMB_RATIO = 1.25;
const EMPTY_PHOTO_MIN = 180;
const EMPTY_PHOTO_MAX = 240;
const EMPTY_PHOTO_RATIO = 0.62;
const BOTTOM_SPACE = spacing.giant * 2;

export default function CreateScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const askedKind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const insets = useSafeAreaInsets();
  const [columnWidth, setColumnWidth] = useState(0);
  const contentWidth = Math.max(columnWidth, MIN_COLUMN_WIDTH);
  const thumb = Math.floor((contentWidth - spacing.sm * 2) / 3);
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const gps = useAnimalGps();
  const [bootShot] = useState(peekInitialCreateShot);
  const [photos, setPhotos] = useState<string[]>(() =>
    bootShot && 'uri' in bootShot ? [bootShot.uri] : [],
  );
  const photosRef = useRef<string[]>(photos);
  useEffect(() => {
    setCreatePhotoCount(photos.length);
  }, [photos]);
  useEffect(() => {
    for (const uri of photosRef.current) preparePhoto(uri);
  }, []);
  useLayoutEffect(() => {
    setCreatePhotoCount(photosRef.current.length);
    if (photosRef.current.length > 0) return;
    if (bootShot && 'error' in bootShot) return;
    openCreateCamera();
  }, [bootShot]);
  const [animalName, setAnimalName] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [kind, setKind] = useState<'rescue_alert' | 'lost' | 'adoption'>(
    askedKind === 'lost' ? 'lost' : askedKind === 'adoption' ? 'adoption' : 'rescue_alert',
  );
  const [appliedKind, setAppliedKind] = useState(askedKind);
  if (askedKind !== appliedKind) {
    setAppliedKind(askedKind);
    if (askedKind === 'lost' || askedKind === 'adoption') setKind(askedKind);
  }
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other'>('dog');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [sex, setSex] = useState<'male' | 'female' | 'unknown'>('unknown');
  const [age, setAge] = useState<AgeBand | null>(null);
  const [care, setCare] = useState<Partial<Record<CareKey, true>>>({});
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>(
    askedKind === 'adoption' ? 'low' : 'high',
  );
  const [manual, setManual] = useState<MapPoint | null>(null);
  const [moved, setMoved] = useState(false);
  const [message, setMessageState] = useState<{ text: string; settings: boolean } | null>(() =>
    bootShot && 'error' in bootShot
      ? { text: bootShot.error, settings: bootShot.blocked === true }
      : null,
  );
  // `settings` adds the "open settings" action, the only way out of a blocked permission.
  const setMessage = useCallback((text: string | null, settings = false) => {
    setMessageState(text ? { text, settings } : null);
  }, []);
  const settingsAction = { label: openSettingsLabel, onPress: () => void openAppSettings() };
  const [pending, setPending] = useState(false);
  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = moved ? manual : located;
  const { address, looking } = useAddress(point);

  const removePhoto = useCallback((uri: string) => {
    const next = photosRef.current.filter((photo) => photo !== uri);
    photosRef.current = next;
    setCreatePhotoCount(next.length);
    setPhotos(next);
  }, []);

  const addPhoto = useCallback((uri: string) => {
    if (photosRef.current.length >= MAX_PHOTOS || photosRef.current.includes(uri)) return;
    preparePhoto(uri);
    const next = [...photosRef.current, uri];
    photosRef.current = next;
    setCreatePhotoCount(next.length);
    setPhotos(next);
  }, []);

  const takePhoto = useCallback(() => {
    openCreateCamera(true);
  }, []);

  useEffect(
    () =>
      watchCreateCamera((shot) => {
        if ('uri' in shot) addPhoto(shot.uri);
        else if ('error' in shot) setMessage(shot.error, shot.blocked === true);
      }),
    [addPhoto, setMessage],
  );

  const pickFromLibrary = useCallback(() => {
    if (photosRef.current.length >= MAX_PHOTOS) return;
    void (async () => {
      if (Platform.OS !== 'web') {
        const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
        if (outcome === 'blocked') {
          setMessage(
            'O acesso à galeria está bloqueado para o app. Libere nas configurações.',
            true,
          );
          return;
        }
        if (outcome === 'denied') {
          setMessage('Preciso da galeria para anexar a foto do animal.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
      if (!uri) return;
      addPhoto(uri);
    })().catch((error: unknown) => {
      // The picker can fail when another activity is already open or storage is unavailable.
      reportError(error, { source: 'handled', where: 'create:gallery' });
      setMessage('Não consegui abrir a galeria. Tente de novo.');
    });
  }, [addPhoto, setMessage]);

  async function publish() {
    if (!token) {
      router.push({ pathname: '/login', params: { returnTo: '/create' } });
      return;
    }
    if (photos.length === 0 || description.trim().length === 0) {
      setMessage('Escreva o que aconteceu e adicione pelo menos uma foto.');
      return;
    }
    if (!point || !insideServiceArea(point)) {
      setMessage('Esse ponto fica fora de Belém. Escolha um lugar dentro da área verde.');
      return;
    }
    setPending(true);
    setMessage(null);
    const draft = {
      id: `${Date.now()}`,
      token,
      photos,
      description: description.trim(),
      kind,
      species,
      size,
      sex,
      name: animalName.trim(),
      ...(age ? { ageEstimate: age } : {}),
      care,
      urgency,
      point,
      accuracyM: gps.fix?.accuracy ?? null,
      addressText: address,
      referencePoint: reference.trim(),
      approxLabel: placeLabel(point, address),
    };
    try {
      const created = await publishAlert(draft);
      photosRef.current = [];
      setCreatePhotoCount(0);
      setPhotos([]);
      setAnimalName('');
      setDescription('');
      setReference('');
      void api('/volunteers/actions/claim-xp', {
        method: 'POST',
        token,
        body: { actionType: 'report', sourceId: created.id },
      })
        .then(() => client.invalidateQueries({ queryKey: ['volunteer', token] }))
        .catch((error: unknown) => {
          reportError(error, { source: 'handled', where: 'create:claim-xp' });
        });
      const fresh = await loadPost(created.id, token).catch(() => null);
      if (fresh) {
        client.setQueryData(
          ['posts', token],
          (current: { posts: Post[]; nextCursor: string | null } | undefined) => ({
            posts: [fresh, ...(current?.posts ?? []).filter((item) => item.id !== fresh.id)],
            nextCursor: current?.nextCursor ?? null,
          }),
        );
      }
      void client.invalidateQueries({ queryKey: ['posts'] });
      void client.invalidateQueries({ queryKey: ['map'] });
      if (created.reviewStatus === 'pending') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          logBestEffort('create:haptic'),
        );
        setMessage('Seu texto foi para revisão antes de aparecer para as outras pessoas.');
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        logBestEffort('create:haptic'),
      );
      router.push(`/post/${created.id}`);
    } catch (error) {
      if (isOfflineError(error)) {
        await enqueueAlert(draft);
        photosRef.current = [];
        setCreatePhotoCount(0);
        setPhotos([]);
        setAnimalName('');
        setDescription('');
        setReference('');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          logBestEffort('create:haptic'),
        );
        setMessage(
          kind === 'adoption'
            ? 'Sem internet. A adoção ficou neste aparelho e sai sozinha quando a rede voltar.'
            : 'Sem internet. O resgate ficou neste aparelho e sai sozinho quando a rede voltar.',
        );
        return;
      }
      setMessage(
        error instanceof ApiError ? error.message : 'Não consegui publicar. Tente de novo.',
      );
    } finally {
      setPending(false);
    }
  }

  const coordinates = point
    ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
    : 'Ponto ainda não definido';
  const thumbSize = { width: thumb, height: Math.round(thumb * THUMB_RATIO) };
  const missing = [
    ...(description.trim().length === 0
      ? [kind === 'adoption' ? 'contar sobre ele' : 'contar o que aconteceu']
      : []),
    ...(point ? [] : ['marcar o lugar no mapa']),
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + BOTTOM_SPACE }]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={styles.column}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            setColumnWidth((current) => (current === next ? current : next));
          }}
        >
          <View style={styles.intro}>
            <Mascot pose={kind === 'lost' ? 'search' : 'sit'} size={INTRO_MASCOT} />
            <AppText variant="h1" style={styles.introTitle}>
              {photos.length === 0 ? 'Fotografar o animal' : 'Sobre o animal'}
            </AppText>
          </View>
          {photos.length === 0 ? (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Abrir a câmera"
              haptic="light"
              pressedScale={0.98}
              onPress={takePhoto}
              style={[
                styles.photoEmpty,
                {
                  height: Math.max(
                    EMPTY_PHOTO_MIN,
                    Math.min(EMPTY_PHOTO_MAX, Math.round(contentWidth * EMPTY_PHOTO_RATIO)),
                  ),
                  backgroundColor: colors.primarySoft,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Icon name="camera" size="xl" color={colors.onPrimarySoft} />
              <AppText variant="button" style={{ color: colors.onPrimarySoft }}>
                Abrir a câmera
              </AppText>
            </Touchable>
          ) : (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <View key={photo} style={[styles.thumbWrap, thumbSize]}>
                  <Image
                    source={{ uri: photo }}
                    style={styles.thumb}
                    contentFit="cover"
                    accessibilityLabel="Foto do animal"
                  />
                  <IconButton
                    icon="x"
                    variant="filled"
                    accessibilityLabel="Remover esta foto"
                    onPress={() => removePhoto(photo)}
                    style={styles.removePhoto}
                  />
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <Touchable
                  accessibilityRole="button"
                  accessibilityLabel="Tirar outra foto"
                  pressedScale={0.96}
                  onPress={takePhoto}
                  style={[
                    styles.add,
                    thumbSize,
                    { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                  ]}
                >
                  <Icon name="camera" size="lg" color={colors.onPrimarySoft} />
                </Touchable>
              ) : null}
            </View>
          )}
          <Button
            title="Escolher da galeria"
            icon="image"
            variant="ghost"
            onPress={pickFromLibrary}
          />
          {photos.length === 0 ? (
            <>
              <AppText variant="bodySmall" color="textSecondary">
                A foto vem primeiro. Espécie, urgência e o lugar entram depois.
              </AppText>
              {message ? (
                <Notice
                  message={message.text}
                  action={message.settings ? settingsAction : undefined}
                />
              ) : null}
            </>
          ) : (
            <>
              <Segmented
                accessibilityLabel="Tipo de publicação"
                options={kindOptions}
                value={kind}
                onChange={(value) => {
                  setKind(value);
                  if (value === 'adoption') setUrgency('low');
                }}
              />
              <View style={styles.section}>
                <SectionHeader
                  title={kind === 'adoption' ? 'Conte sobre ele' : 'O que está acontecendo'}
                  flush
                />
                {kind !== 'adoption' ? (
                  <View style={styles.group}>
                    <AppText variant="bodyStrong">Urgência</AppText>
                    <View style={styles.chips}>
                      {urgencyOptions.map((option) => (
                        <Chip
                          key={option.value}
                          label={option.label}
                          selected={urgency === option.value}
                          onPress={() => setUrgency(option.value)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
                <View style={styles.group}>
                  <AppText variant="bodySmall" color="textSecondary">
                    Toque numa sugestão ou escreva do seu jeito
                  </AppText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.suggestionRow}
                  >
                    {(kind === 'adoption' ? adoptionSuggestions : suggestions).map((text) => (
                      <Chip
                        key={text}
                        label={text}
                        multiline
                        selected={description === text}
                        onPress={() => {
                          void Haptics.selectionAsync().catch(logBestEffort('create:haptic'));
                          setDescription(text);
                        }}
                      />
                    ))}
                  </ScrollView>
                </View>
                <Input
                  label="Descrição"
                  multiline
                  value={description}
                  onChangeText={setDescription}
                  placeholder={
                    kind === 'adoption'
                      ? 'Jeito, saúde e com quem ele se dá bem'
                      : 'O que você viu e como o animal está'
                  }
                />
              </View>
              <View style={styles.section}>
                <SectionHeader
                  title="Onde o animal está"
                  subtitle="No app aparece só o bairro. O ponto exato fica com quem for ajudar."
                  flush
                />
                <AppText variant="bodySmall" color="textSecondary">
                  {moved
                    ? 'Ponto escolhido no mapa.'
                    : gps.fix && !located
                      ? 'Sua localização está fora de Belém. Mova o mapa até a área verde.'
                      : gps.message}
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
                    focus={moved ? null : located}
                    accuracyM={moved ? null : (located?.accuracy ?? null)}
                    urgency={urgency}
                    onOutside={() => {
                      setMessage(
                        'Esse ponto fica fora de Belém. O mapa só libera a cidade e a região em volta.',
                      );
                    }}
                    onChange={(next, fromUser) => {
                      if (!fromUser || !insideServiceArea(next)) return;
                      setMoved(true);
                      setManual(next);
                      setMessage(null);
                    }}
                  />
                  {gps.status === 'loading' ? (
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
                    setMoved(false);
                    void gps.retry();
                  }}
                />
                <View style={styles.address}>
                  <Icon name="map-pin" color={colors.primary} />
                  <AppText variant="bodyStrong" style={styles.addressText}>
                    {looking ? 'Buscando o endereço...' : (address ?? coordinates)}
                  </AppText>
                </View>
                <Input
                  label="Ponto de referência"
                  value={reference}
                  onChangeText={setReference}
                  placeholder="Se quiser. Ex.: em frente à padaria"
                />
              </View>
              <View style={styles.section}>
                <SectionHeader title="Sobre o animal" flush />
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
                <View style={styles.group}>
                  <AppText variant="bodyStrong">Sexo</AppText>
                  <View style={styles.chips}>
                    {sexOptions.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={sex === option.value}
                        onPress={() => setSex(option.value)}
                      />
                    ))}
                  </View>
                </View>
                <View style={styles.group}>
                  <AppText variant="bodyStrong">Idade</AppText>
                  <View style={styles.chips}>
                    {ageBands.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={age === option.value}
                        onPress={() => setAge(age === option.value ? null : option.value)}
                      />
                    ))}
                  </View>
                </View>
                <View style={styles.group}>
                  <AppText variant="bodyStrong">O que você já sabe</AppText>
                  <AppText variant="bodySmall" color="textSecondary">
                    Marque só o que tem certeza. É o que quem adota pergunta primeiro.
                  </AppText>
                  <View style={styles.chips}>
                    {careKeys.map((key) => (
                      <Chip
                        key={key}
                        label={careQuestion[key]}
                        selected={care[key] === true}
                        onPress={() =>
                          setCare((current) => {
                            const next = { ...current };
                            if (next[key]) delete next[key];
                            else next[key] = true;
                            return next;
                          })
                        }
                      />
                    ))}
                  </View>
                </View>
                <Input
                  label="Nome (se souber)"
                  value={animalName}
                  onChangeText={setAnimalName}
                  placeholder="Ex.: Pretinho da esquina"
                  maxLength={80}
                  helper="Vira o título do card. Sem nome, o card mostra a espécie."
                />
              </View>
              {missing.length > 0 ? (
                <AppText variant="bodySmall" color="textSecondary">
                  Falta {missing.join(' e ')}.
                </AppText>
              ) : null}
              {message ? (
                <Notice
                  message={message.text}
                  action={message.settings ? settingsAction : undefined}
                />
              ) : null}
              <Button
                title={pending ? 'Publicando...' : 'Publicar'}
                icon="send"
                size="lg"
                loading={pending}
                fullWidth
                onPress={() => void publish()}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  column: { ...screenColumn, gap: spacing.lg },
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  introTitle: { flex: 1 },
  photoEmpty: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: { borderRadius: radius.md, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: spacing.xs, right: spacing.xs },
  add: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: spacing.md, paddingTop: spacing.lg },
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestionRow: { gap: spacing.sm, paddingRight: spacing.sm },
  map: { borderRadius: radius.lg, overflow: 'hidden' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  address: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addressText: { flex: 1 },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
