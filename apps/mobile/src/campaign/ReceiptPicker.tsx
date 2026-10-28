import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { messageFrom } from '../api';
import { AppText, Button, IconButton } from '../components/ui';
import { reportError } from '../crash/reporter';
import { permissionOutcome } from '../permissions';
import { uploadProfilePhoto } from '../place/publish';
import { radius, spacing } from '../theme';

/**
 * Foto do comprovante. Envia assim que a pessoa escolhe e devolve a chave do envio; o
 * formulário só libera salvar com a chave na mão.
 */
export function ReceiptPicker({
  token,
  label,
  receiptKey,
  onChange,
  onError,
}: {
  token: string | null;
  label: string;
  receiptKey: string | null;
  onChange: (key: string | null) => void;
  onError: (message: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pick() {
    if (!token || uploading) return;
    try {
      if (Platform.OS !== 'web') {
        const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
        if (outcome !== 'granted') {
          onError('Preciso da galeria para anexar o comprovante.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
      if (!uri) return;
      setUploading(true);
      const key = await uploadProfilePhoto(token, uri);
      setPreview(uri);
      onChange(key);
    } catch (error) {
      reportError(error, { source: 'handled', where: 'campaign:receipt' });
      onError(messageFrom(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <AppText variant="bodyStrong">{label}</AppText>
      {receiptKey && preview ? (
        <View style={styles.row}>
          <Image
            source={{ uri: preview }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityLabel="Comprovante anexado"
          />
          <AppText variant="bodySmall" color="textSecondary" style={styles.grow}>
            Comprovante anexado.
          </AppText>
          <IconButton
            icon="x"
            accessibilityLabel="Tirar o comprovante"
            onPress={() => {
              setPreview(null);
              onChange(null);
            }}
          />
        </View>
      ) : (
        <Button
          title={uploading ? 'Enviando a foto...' : 'Anexar foto do comprovante'}
          icon="paperclip"
          variant="outline"
          loading={uploading}
          disabled={uploading}
          onPress={() => void pick()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 64, height: 80, borderRadius: radius.md },
  grow: { flex: 1 },
});
