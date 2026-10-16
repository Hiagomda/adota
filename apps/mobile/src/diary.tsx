import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AppText, Button, Icon, IconButton, Input, type IconName } from './components/ui';
import { reportError } from './crash/reporter';
import { permissionOutcome } from './permissions';
import { formatWhen } from './format';
import { diaryLines, type DiaryTone } from './post/diaryEntries';
import { radius, spacing, useTheme, type ColorRoles } from './theme';
import type { Post } from './types';

const BADGE = 32;
const PHOTO_HEIGHT = 180;
const PREVIEW = 88;
const RAIL = 2;

/** Each kind of line has its own mark, so a missed visit never reads like progress. */
const toneStyle: Record<
  DiaryTone,
  { icon: IconName; background: keyof ColorRoles; foreground: keyof ColorRoles }
> = {
  found: { icon: 'map-pin', background: 'secondarySoft', foreground: 'onSecondarySoft' },
  status: { icon: 'arrow-right', background: 'primarySoft', foreground: 'onPrimarySoft' },
  not_found: { icon: 'search', background: 'warningSoft', foreground: 'onWarningSoft' },
  note: { icon: 'edit-3', background: 'surfaceMuted', foreground: 'textSecondary' },
};

export function AnimalDiary({
  post,
  canWrite,
  adopted = false,
  onPublish,
}: {
  post: Post;
  canWrite: boolean;
  /** After adoption the diary becomes "Notícias da casa nova". */
  adopted?: boolean;
  onPublish: (description: string, photoUri: string | null) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function pickPhoto() {
    setPhotoError(null);
    try {
      if (Platform.OS !== 'web') {
        const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
        if (outcome !== 'granted') {
          setPhotoError('Preciso da galeria para anexar a foto.');
          return;
        }
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      const uri = picked.canceled ? undefined : picked.assets?.[0]?.uri;
      if (uri) setPhoto(uri);
    } catch (error) {
      reportError(error, { source: 'handled', where: 'diary:gallery' });
      setPhotoError('Não consegui abrir a galeria. Tente de novo.');
    }
  }
  const entries = diaryLines(post);

  async function publish() {
    const description = text.trim();
    if (!description || sending) return;
    setSending(true);
    const ok = await onPublish(description, photo);
    setSending(false);
    if (ok) {
      setText('');
      setPhoto(null);
    }
  }

  return (
    <View style={styles.block}>
      <AppText variant="h2">{adopted ? 'Notícias da casa nova' : 'Diário'}</AppText>
      <AppText variant="bodySmall" color="textSecondary">
        {adopted
          ? 'Fotos e novidades do animal no lar novo. Quem ajudou recebe o aviso.'
          : 'As atualizações ficam neste resgate. Quem acompanha recebe o aviso.'}
      </AppText>
      <View>
        {entries.map((entry, index) => {
          const tone = toneStyle[entry.tone];
          return (
            <View
              key={entry.id}
              accessible
              accessibilityLabel={`${entry.title}, ${formatWhen(entry.when)}. ${entry.body ?? ''}`}
              style={styles.row}
            >
              <View style={styles.rail}>
                <View style={[styles.badge, { backgroundColor: colors[tone.background] }]}>
                  <Icon name={tone.icon} size="sm" color={colors[tone.foreground]} />
                </View>
                {index < entries.length - 1 ? (
                  <View style={[styles.line, { backgroundColor: colors.border }]} />
                ) : null}
              </View>
              <View style={styles.entry}>
                <AppText variant="bodyStrong">{entry.title}</AppText>
                <AppText variant="caption" color="textSecondary">
                  @{entry.handle} · {formatWhen(entry.when)}
                </AppText>
                {entry.body ? <AppText>{entry.body}</AppText> : null}
                {entry.photo ? (
                  <Image
                    source={{ uri: entry.photo.thumbUrl }}
                    style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
                    contentFit="cover"
                    accessibilityLabel={`Foto da nota de @${entry.handle}`}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      {canWrite ? (
        <View style={styles.composer}>
          <Input
            label="Nova nota"
            value={text}
            onChangeText={setText}
            placeholder={adopted ? 'Como ele está no lar novo?' : 'Como ele está agora?'}
            multiline
            maxLength={300}
            helper={`${text.length}/300`}
          />
          {photo ? (
            <View style={styles.preview}>
              <Image source={{ uri: photo }} style={styles.previewImage} contentFit="cover" />
              <IconButton
                icon="x"
                variant="filled"
                accessibilityLabel="Tirar a foto da nota"
                onPress={() => setPhoto(null)}
              />
            </View>
          ) : (
            <Button
              title="Adicionar uma foto"
              icon="image"
              variant="ghost"
              onPress={() => void pickPhoto()}
            />
          )}
          {photoError ? (
            <AppText variant="bodySmall" color="errorText">
              {photoError}
            </AppText>
          ) : null}
          <Button
            title={sending ? 'Publicando...' : 'Publicar no diário'}
            accessibilityLabel="Publicar no diário"
            icon="send"
            loading={sending}
            disabled={text.trim().length === 0}
            fullWidth
            onPress={() => void publish()}
          />
        </View>
      ) : (
        <AppText variant="bodySmall" color="textSecondary">
          Toque em Eu vou ajudar para escrever no diário deste animal.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: BADGE, alignItems: 'center' },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { width: RAIL, flex: 1, marginVertical: spacing.xs },
  entry: { flex: 1, gap: spacing.xs, paddingBottom: spacing.lg },
  composer: { gap: spacing.md },
  photo: { width: '100%', height: PHOTO_HEIGHT, borderRadius: radius.lg, marginTop: spacing.xs },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  previewImage: { width: PREVIEW, height: PREVIEW, borderRadius: radius.md },
});
