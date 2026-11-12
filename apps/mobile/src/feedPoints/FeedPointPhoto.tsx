import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { messageFrom } from '../api';
import { AppText, Button, IconButton } from '../components/ui';
import { reportError } from '../crash/reporter';
import { permissionOutcome } from '../permissions';
import { uploadProfilePhoto } from '../place/publish';
import { radius, spacing, useTheme } from '../theme';

/**
 * Foto do ponto: câmera ou galeria. Envia assim que a pessoa escolhe e devolve a chave do envio.
 * `currentUrl` é a foto que o ponto já tem, na edição.
 */
export function FeedPointPhoto({
  token,
  currentUrl,
  onChange,
  onError,
}: {
  token: string | null;
  currentUrl: string | null;
  /** Chave nova, ou `null` quando a pessoa tira a foto. */
  onChange: (change: { key: string | null; removed: boolean }) => void;
  onError: (message: string) => void;
}) {
  const { colors } = useTheme();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);

  async function pick(source: 'camera' | 'library') {
    if (!token || uploading) return;
    try {
      if (Platform.OS !== 'web') {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionOutcome(permission) !== 'granted') {
          onError(
            source === 'camera'
              ? 'Preciso da câmera para tirar a foto do ponto.'
              : 'Preciso da galeria para escolher a foto do ponto.',
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
      if (!uri) return;
      setUploading(true);
      const key = await uploadProfilePhoto(token, uri);
      setPreview(uri);
      onChange({ key, removed: false });
    } catch (error) {
      reportError(error, { source: 'handled', where: 'feed-points:photo' });
      onError(messageFrom(error));
    } finally {
      setUploading(false);
    }
  }

  if (preview) {
    return (
      <View>
        <Image
          source={{ uri: preview }}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel="Foto do ponto"
        />
        <View style={[styles.remove, { backgroundColor: colors.surface }]}>
          <IconButton
            icon="x"
            accessibilityLabel="Tirar a foto"
            onPress={() => {
              setPreview(null);
              onChange({ key: null, removed: true });
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Button
          title="Tirar foto"
          icon="camera"
          variant="outline"
          loading={uploading}
          disabled={uploading}
          onPress={() => void pick('camera')}
          style={styles.grow}
        />
        <Button
          title="Da galeria"
          icon="image"
          variant="outline"
          disabled={uploading}
          onPress={() => void pick('library')}
          style={styles.grow}
        />
      </View>
      <AppText variant="caption" color="textSecondary">
        {uploading
          ? 'Enviando a foto...'
          : 'Com foto do pote ou do lugar, fica mais fácil achar. Evite mostrar placa de carro ou rosto de gente.'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  remove: { position: 'absolute', top: spacing.sm, right: spacing.sm, borderRadius: radius.pill },
});
