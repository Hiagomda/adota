import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../src/api';
import type { MapPoint } from '../../src/map/geo';
import { insideServiceArea } from '../../src/map/serviceArea';
import { useAddress, placeLabel } from '../../src/place/address';
import { useAnimalGps } from '../../src/place/gps';
import { openCreateCamera, setCreatePhotoCount, watchCreateCamera } from '../../src/createCamera';
import { Mascot } from '../../src/mascot';
import { enqueueAlert } from '../../src/place/outbox';
import { PlacePicker } from '../../src/place/PlacePicker';
import { isOfflineError, publishAlert } from '../../src/place/publish';
import { useSession } from '../../src/session';
import { palette, screenColumn, useTheme } from '../../src/theme';

const suggestions = [
  'Está na rua e precisa de resgate agora.',
  'Parece machucado e não consegue andar.',
  'Está preso e precisa de ajuda para sair.',
  'Filhotes sozinhos, sem a mãe por perto.',
];

export default function CreateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const askedKind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const insets = useSafeAreaInsets();
  const [columnWidth, setColumnWidth] = useState(0);
  const contentWidth = Math.max(columnWidth, 280);
  const thumb = Math.floor((contentWidth - 16) / 3);
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const gps = useAnimalGps();
  const [photos, setPhotos] = useState<string[]>([]);
  const photosRef = useRef<string[]>([]);
  useEffect(() => {
    setCreatePhotoCount(photos.length);
  }, [photos]);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [kind, setKind] = useState<'rescue_alert' | 'lost'>(
    askedKind === 'lost' ? 'lost' : 'rescue_alert',
  );
  const [appliedKind, setAppliedKind] = useState(askedKind);
  if (askedKind !== appliedKind) {
    setAppliedKind(askedKind);
    if (askedKind === 'lost') setKind('lost');
  }
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other'>('dog');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('high');
  const [manual, setManual] = useState<MapPoint | null>(null);
  const [moved, setMoved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = moved ? manual : located;
  const { address, looking } = useAddress(point);

  const addPhoto = useCallback((uri: string) => {
    if (photosRef.current.length >= 5 || photosRef.current.includes(uri)) return;
    const next = [...photosRef.current, uri];
    photosRef.current = next;
    setCreatePhotoCount(next.length);
    setPhotos(next);
  }, []);

  const takePhoto = useCallback(() => {
    openCreateCamera(true);
  }, []);

  useEffect(() => watchCreateCamera((shot) => {
    if ('uri' in shot) addPhoto(shot.uri);
    else if ('error' in shot) setMessage(shot.error);
  }), [addPhoto]);

  const pickFromLibrary = useCallback(() => {
    if (photosRef.current.length >= 5) return;
    void (async () => {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
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
    })();
  }, [addPhoto]);

  async function publish() {
    if (!token) {
      setMessage('Entre numa conta para publicar o resgate.');
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
      setDescription('');
      setReference('');
      void api('/volunteers/actions/claim-xp', {
        method: 'POST',
        token,
        body: { actionType: 'report', sourceId: created.id },
      })
        .then(() => client.invalidateQueries({ queryKey: ['volunteer', token] }))
        .catch(() => undefined);
      await client.invalidateQueries({ queryKey: ['posts'] });
      await client.invalidateQueries({ queryKey: ['map'] });
      if (created.reviewStatus === 'pending') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        setMessage('Seu texto foi para revisão antes de aparecer para as outras pessoas.');
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      router.push(`/post/${created.id}`);
    } catch (error) {
      if (isOfflineError(error)) {
        await enqueueAlert(draft);
        photosRef.current = [];
        setCreatePhotoCount(0);
        setPhotos([]);
        setDescription('');
        setReference('');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        setMessage('Sem internet. O resgate ficou neste aparelho e sai sozinho quando a rede voltar.');
        return;
      }
      setMessage(error instanceof ApiError ? error.message : 'Não consegui publicar. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  const coordinates = point
    ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
    : 'Ponto ainda não definido';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
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
          <Mascot pose={kind === 'lost' ? 'search' : 'sit'} size={72} />
          <Text style={[styles.title, { color: theme.text, flex: 1 }]}>
            {photos.length === 0 ? 'Fotografar o animal' : 'Sobre o animal'}
          </Text>
        </View>
        {photos.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir a câmera"
            style={[
              styles.photoEmpty,
              { height: Math.max(180, Math.min(240, Math.round(contentWidth * 0.62))), backgroundColor: theme.surface, borderColor: theme.line },
            ]}
            onPress={takePhoto}
          >
            <Feather name="camera" size={32} color={theme.text} />
            <Text style={[styles.note, { color: theme.text }]}>Abrir a câmera</Text>
          </Pressable>
        ) : (
          <View style={styles.row}>
            {photos.map((photo) => (
              <Image
                key={photo}
                source={{ uri: photo }}
                style={{ width: thumb, height: Math.round(thumb * 1.25), borderRadius: 12 }}
              />
            ))}
            {photos.length < 5 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tirar outra foto"
                style={[
                  styles.add,
                  {
                    width: thumb,
                    height: Math.round(thumb * 1.25),
                    backgroundColor: theme.surface,
                    borderColor: theme.line,
                  },
                ]}
                onPress={takePhoto}
              >
                <Feather name="camera" size={26} color={theme.text} />
              </Pressable>
            ) : null}
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={pickFromLibrary}>
          <Text style={[styles.note, { color: theme.muted }]}>Escolher da galeria</Text>
        </Pressable>
        {photos.length === 0 ? (
          <>
            <Text style={[styles.note, { color: theme.muted }]}>
              A foto vem primeiro. Espécie, urgência e o lugar entram depois.
            </Text>
            {message ? <Text style={[styles.note, { color: theme.muted }]}>{message}</Text> : null}
          </>
        ) : (
          <>
        <View style={styles.row}>
          {(['rescue_alert', 'lost'] as const).map((item) => (
            <Pressable
              key={item}
              style={[styles.choice, kind === item ? styles.choiceOn : { backgroundColor: theme.surface }]}
              onPress={() => setKind(item)}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.choiceText, { color: kind === item ? palette.acai : theme.muted }]}
              >
                {item === 'lost' ? 'Perdido' : 'Resgate'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {(['dog', 'cat', 'other'] as const).map((item) => (
            <Pressable
              key={item}
              style={[styles.choice, species === item ? styles.choiceOn : { backgroundColor: theme.surface }]}
              onPress={() => setSpecies(item)}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.choiceText, { color: species === item ? palette.acai : theme.muted }]}
              >
                {item === 'dog' ? 'Cachorro' : item === 'cat' ? 'Gato' : 'Outro'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {(['high', 'medium', 'low'] as const).map((item) => (
            <Pressable
              key={item}
              style={[styles.choice, urgency === item ? styles.choiceOn : { backgroundColor: theme.surface }]}
              onPress={() => setUrgency(item)}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={[styles.choiceText, { color: urgency === item ? palette.acai : theme.muted }]}
              >
                {item === 'high' ? 'Urgente' : item === 'medium' ? 'Atenção' : 'Pode esperar'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.suggestions}>
          <Text style={[styles.note, { color: theme.muted }]}>Sugestões para a descrição</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>
            {suggestions.map((text) => {
              const selected = description === text;
              return (
                <Pressable
                  key={text}
                  accessibilityRole="button"
                  style={[styles.suggestion, selected ? styles.choiceOn : { backgroundColor: theme.surface }]}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => undefined);
                    setDescription(text);
                  }}
                >
                  <Text
                    style={[styles.suggestionText, { color: selected ? palette.acai : theme.text }]}
                  >
                    {text}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <TextInput
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="O que você viu e como o animal está"
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface }]}
        />
        <Text style={[styles.note, { color: theme.muted }]}>
          {gps.fix && !located
            ? 'Sua localização está fora de Belém. Mova o mapa até a área verde.'
            : gps.message}
        </Text>
        <View>
          <PlacePicker
            focus={moved ? null : located}
            accuracyM={moved ? null : (located?.accuracy ?? null)}
            urgency={urgency}
            onOutside={() => {
              setMessage('Esse ponto fica fora de Belém. O mapa só libera a cidade e a região em volta.');
            }}
            onChange={(next, fromUser) => {
              if (!fromUser || !insideServiceArea(next)) return;
              setMoved(true);
              setManual(next);
              setMessage(null);
            }}
          />
          {gps.status === 'loading' ? (
            <View style={styles.loading}>
              <ActivityIndicator color={palette.areia} />
              <Text style={styles.loadingText}>Buscando o GPS...</Text>
            </View>
          ) : null}
        </View>
        <Pressable
          style={[styles.location, { borderColor: theme.text }]}
          onPress={() => {
            setMoved(false);
            void gps.retry();
          }}
        >
          <Text style={[styles.locationText, { color: theme.text }]}>Usar minha localização atual</Text>
        </Pressable>
        <Text style={[styles.address, { color: theme.text }]}>
          {looking ? 'Buscando o endereço...' : (address ?? coordinates)}
        </Text>
        <TextInput
          value={reference}
          onChangeText={setReference}
          placeholder="Ponto de referência, se quiser. Ex.: em frente à padaria"
          placeholderTextColor={theme.muted}
          style={[styles.reference, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface }]}
        />
        {gps.fix ? (
          <Text style={[styles.note, { color: theme.muted }]}>
            Precisão do GPS: {Math.round(gps.fix.accuracy)} m
          </Text>
        ) : null}
        {message ? <Text style={[styles.note, { color: theme.muted }]}>{message}</Text> : null}
        <Pressable style={styles.button} disabled={pending} onPress={() => void publish()}>
          <Text style={styles.buttonText}>{pending ? 'Publicando...' : 'Publicar'}</Text>
        </Pressable>
          </>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  column: { ...screenColumn, gap: 16 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  note: { fontSize: 14, lineHeight: 20 },
  address: { fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 8 },
  photoEmpty: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  add: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  reference: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  suggestions: { gap: 8 },
  suggestionRow: { gap: 8, paddingRight: 8 },
  suggestion: {
    maxWidth: 220,
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  suggestionText: { fontSize: 14, lineHeight: 18 },
  choice: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  choiceOn: { backgroundColor: palette.caju },
  choiceText: { fontWeight: '700', textAlign: 'center' },
  location: {
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  locationText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonText: { color: palette.acai, fontSize: 17, fontWeight: '700' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 59, 63, 0.45)',
    borderRadius: 16,
    gap: 8,
  },
  loadingText: { color: palette.areia, fontWeight: '700' },
});
