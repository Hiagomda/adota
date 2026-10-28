import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { uploadProfilePhoto } from '../place/publish';
import { permissionOutcome } from '../permissions';
import { radius, size, spacing } from '../theme';
import { AppText, BottomSheet, Button, Chip, IconButton, Input } from '../components/ui';
import { furColors, toggleFurColor, type FurColor } from '../lost/lostMatch';
import { ageBandOf, ageBands, careKeys, careQuestion, type AgeBand, type AnimalCare } from './care';

const MAX_PHOTOS = 5;

interface EditPhoto {
  key: string;
  preview: string;
}

interface PostEditorProps {
  visible: boolean;
  token: string;
  description: string;
  name: string;
  urgency: 'low' | 'medium' | 'high';
  ageEstimate: string | null;
  care: AnimalCare | undefined;
  /** Cores do pelo. Undefined quando a API não mandou: aí o editor não mexe nelas. */
  colors: string[] | undefined;
  photos: EditPhoto[];
  onClose: () => void;
  onSave: (body: {
    description: string;
    name: string;
    urgency: 'low' | 'medium' | 'high';
    ageEstimate?: AgeBand;
    care: AnimalCare;
    colors?: FurColor[];
    media: { url: string }[];
  }) => Promise<void>;
}

const urgencyOptions = [
  { value: 'high', label: 'Urgente' },
  { value: 'medium', label: 'Atenção' },
  { value: 'low', label: 'Pode esperar' },
] as const;

export function PostEditor({
  visible,
  token,
  description,
  name,
  urgency,
  ageEstimate,
  care,
  colors,
  photos,
  onClose,
  onSave,
}: PostEditorProps) {
  const [draft, setDraft] = useState(description);
  const [title, setTitle] = useState(name);
  const [level, setLevel] = useState(urgency);
  const [age, setAge] = useState<AgeBand | null>(ageBandOf(ageEstimate));
  const [facts, setFacts] = useState<AnimalCare>(care ?? {});
  const [furs, setFurs] = useState<FurColor[]>(() =>
    furColors.map((item) => item.value).filter((value) => colors?.includes(value)),
  );
  const [pictures, setPictures] = useState(photos);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function addPhoto() {
    if (pictures.length >= MAX_PHOTOS || saving) return;
    if (Platform.OS !== 'web') {
      const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
      if (outcome !== 'granted') {
        setError('Preciso da galeria para trocar a foto do animal.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
    if (!uri) return;
    setSaving(true);
    setError(null);
    try {
      const key = await uploadProfilePhoto(token, uri);
      setPictures((current) => [...current, { key, preview: uri }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não consegui enviar a foto.');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const text = draft.trim();
    if (!text) {
      setError('Escreva o que aconteceu com o animal.');
      return;
    }
    if (pictures.length === 0) {
      setError('O resgate precisa de pelo menos uma foto.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        description: text,
        name: title.trim(),
        urgency: level,
        ...(age ? { ageEstimate: age } : {}),
        care: facts,
        ...(colors !== undefined ? { colors: furs } : {}),
        media: pictures.map((photo) => ({ url: photo.key })),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não consegui salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Editar resgate">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
        <Input
          label="Nome"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder="Ex.: Pretinho da esquina"
          helper="É o título do resgate. Vazio mostra só a espécie."
        />
        <Input
          label="O que aconteceu"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
        />
        <View style={styles.chips}>
          {urgencyOptions.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={level === option.value}
              onPress={() => setLevel(option.value)}
            />
          ))}
        </View>
        <AppText variant="bodyStrong">Idade</AppText>
        <View style={styles.chips}>
          {ageBands.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={age === option.value}
              onPress={() => setAge(option.value)}
            />
          ))}
        </View>
        {colors !== undefined ? (
          <>
            <AppText variant="bodyStrong">Cores do pelo (até 3)</AppText>
            <View style={styles.chips}>
              {furColors.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={furs.includes(option.value)}
                  onPress={() => setFurs((current) => toggleFurColor(current, option.value))}
                />
              ))}
            </View>
            <AppText variant="caption" color="textSecondary">
              Ajuda a busca de perdidos a achar animais parecidos.
            </AppText>
          </>
        ) : null}
        <AppText variant="bodyStrong">O que você já sabe</AppText>
        <View style={styles.chips}>
          {careKeys.map((key) => (
            <Chip
              key={key}
              label={careQuestion[key]}
              selected={facts[key] === true}
              // Tapping again says "no", the third tap goes back to "nobody said".
              onPress={() =>
                setFacts((current) => ({
                  ...current,
                  [key]: current[key] === true ? false : current[key] === false ? null : true,
                }))
              }
            />
          ))}
        </View>
        <AppText variant="caption" color="textSecondary">
          Toque uma vez para sim, outra para não, e mais uma para deixar em branco.
        </AppText>
        <View style={styles.photos}>
          {pictures.map((photo) => (
            <View key={photo.key} style={styles.thumbWrap}>
              <Image source={{ uri: photo.preview }} style={styles.thumb} contentFit="cover" />
              <IconButton
                icon="x"
                variant="filled"
                accessibilityLabel="Tirar esta foto"
                onPress={() =>
                  setPictures((current) => current.filter((item) => item.key !== photo.key))
                }
                style={styles.remove}
              />
            </View>
          ))}
          {pictures.length < MAX_PHOTOS ? (
            <Button
              title="Adicionar foto"
              icon="image"
              variant="outline"
              onPress={() => void addPhoto()}
            />
          ) : null}
        </View>
        {error ? <AppText color="errorText">{error}</AppText> : null}
        <Button
          title="Salvar"
          icon="check"
          size="lg"
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md, paddingBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  thumbWrap: { width: size.touch * 1.6, height: size.touch * 1.6 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md },
  remove: { position: 'absolute', top: 0, right: 0 },
});
