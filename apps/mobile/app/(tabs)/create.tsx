import { useQueryClient } from '@tanstack/react-query';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, apiUrl } from '../../src/api';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme';

const fallback = { latitude: -1.4558, longitude: -48.5039, label: 'Belém' };

export default function CreateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'rescue_alert' | 'lost'>('rescue_alert');
  const [species, setSpecies] = useState<'dog' | 'cat' | 'other'>('dog');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('high');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function pick() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Preciso da galeria para anexar a foto do animal.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    setPhotos((current) => (current.length >= 5 ? current : [...current, uri]));
  }

  async function publish() {
    if (!token || photos.length === 0 || description.trim().length === 0) {
      setMessage('Escreva o que aconteceu e adicione pelo menos uma foto.');
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      const position = permission.granted ? await Location.getCurrentPositionAsync({}) : null;
      const latitude = position?.coords.latitude ?? fallback.latitude;
      const longitude = position?.coords.longitude ?? fallback.longitude;
      const media: { url: string }[] = [];
      for (const photo of photos) {
        const compressed = await ImageManipulator.manipulateAsync(
          photo,
          [{ resize: { width: 1080 } }],
          {
            compress: 0.7,
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );
        const file = await fetch(compressed.uri);
        const blob = await file.blob();
        const signed = await api<{ uploads: { key: string; uploadUrl: string }[] }>(
          '/uploads/presign',
          {
            method: 'POST',
            token,
            body: { files: [{ contentType: 'image/jpeg', bytes: blob.size }] },
          },
        );
        const upload = signed.uploads[0];
        if (!upload) throw new Error('Sem endereço de envio');
        const put = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'image/jpeg' },
          body: blob,
        });
        if (!put.ok) throw new Error('Falha no envio');
        media.push({ url: upload.key });
      }
      const created = await api<{ id: string; reviewStatus: string }>('/posts', {
        method: 'POST',
        token,
        body: {
          type: kind,
          species,
          size: 'medium',
          urgency,
          description,
          latitude,
          longitude,
          approxLabel: position ? 'Perto de você, Belém' : fallback.label,
          media,
        },
      });
      setPhotos([]);
      setDescription('');
      await client.invalidateQueries({ queryKey: ['posts'] });
      if (created.reviewStatus === 'pending') {
        setMessage('Seu texto foi para revisão antes de aparecer no feed.');
        return;
      }
      router.push(`/post/${created.id}`);
    } catch {
      setMessage('Não consegui publicar. A foto e o texto continuam aqui. Tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>Criar alerta</Text>
        <View style={styles.row}>
          {photos.map((photo) => (
            <Image key={photo} source={{ uri: photo }} style={styles.thumb} />
          ))}
          {photos.length < 5 ? (
            <Pressable style={[styles.thumb, styles.add]} onPress={() => void pick()}>
              <Text style={{ color: theme.text }}>Foto</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="O que você viu, onde, e como o animal está"
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.text, borderColor: theme.line }]}
        />
        <View style={styles.row}>
          {(['rescue_alert', 'lost'] as const).map((item) => (
            <Pressable key={item} onPress={() => setKind(item)}>
              <Text style={{ color: kind === item ? theme.accent : theme.muted }}>
                {item === 'lost' ? 'Perdido' : 'Resgate'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {(['dog', 'cat', 'other'] as const).map((item) => (
            <Pressable key={item} onPress={() => setSpecies(item)}>
              <Text style={{ color: species === item ? theme.accent : theme.muted }}>
                {item === 'dog' ? 'Cachorro' : item === 'cat' ? 'Gato' : 'Outro'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {(['high', 'medium', 'low'] as const).map((item) => (
            <Pressable key={item} onPress={() => setUrgency(item)}>
              <Text style={{ color: urgency === item ? theme.accent : theme.muted }}>
                {item === 'high' ? 'Urgente' : item === 'medium' ? 'Atenção' : 'Pode esperar'}
              </Text>
            </Pressable>
          ))}
        </View>
        {message ? <Text style={{ color: theme.muted }}>{message}</Text> : null}
        <Pressable style={styles.button} disabled={pending} onPress={() => void publish()}>
          <Text style={styles.buttonText}>{pending ? 'Publicando...' : 'Publicar alerta'}</Text>
        </Pressable>
        <Text style={{ color: theme.muted }}>
          As fotos vão para {apiUrl.replace('http://', '')}.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 88, height: 110, borderRadius: 12 },
  add: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F4' },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#FF6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
