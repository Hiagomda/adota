import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { messageFrom } from '../api';
import { AppText, Button, IconButton, Touchable } from '../components/ui';
import { reportError } from '../crash/reporter';
import { permissionOutcome } from '../permissions';
import { uploadProfilePhoto } from '../place/publish';
import { darkAccentHeroes, lightAccentHeroes, radius, spacing, useTheme } from '../theme';
import { bannerColorChoices, type CampaignBannerColor } from './campaign';

/**
 * Como a campanha aparece no banner de destaques do Início: uma foto (opcional) e a cor da faixa.
 * A foto sobe assim que a pessoa escolhe; o formulário guarda só a chave do envio.
 */
export function BannerPicker({
  token,
  color,
  onColor,
  bannerKey,
  onBanner,
  onError,
  initialPreview = null,
}: {
  token: string | null;
  color: CampaignBannerColor;
  onColor: (color: CampaignBannerColor) => void;
  bannerKey: string | null;
  onBanner: (key: string | null) => void;
  onError: (message: string) => void;
  /** Foto que a campanha já tem, ao editar. */
  initialPreview?: string | null;
}) {
  const { colors, dark } = useTheme();
  const heroes = dark ? darkAccentHeroes : lightAccentHeroes;
  const [preview, setPreview] = useState<string | null>(initialPreview);
  const [uploading, setUploading] = useState(false);

  async function pick() {
    if (!token || uploading) return;
    try {
      if (Platform.OS !== 'web') {
        const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
        if (outcome !== 'granted') {
          onError('Preciso da galeria para escolher a foto do banner.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      const uri = result.canceled ? undefined : result.assets?.[0]?.uri;
      if (!uri) return;
      setUploading(true);
      const key = await uploadProfilePhoto(token, uri);
      setPreview(uri);
      onBanner(key);
    } catch (error) {
      reportError(error, { source: 'handled', where: 'campaign:banner' });
      onError(messageFrom(error));
    } finally {
      setUploading(false);
    }
  }

  const hero = heroes[color];
  return (
    <View style={styles.wrap}>
      <AppText variant="bodyStrong">Banner de destaque</AppText>
      <AppText variant="bodySmall" color="textSecondary">
        É a faixa que passa no topo do Início. Escolha a cor e, se quiser, uma foto.
      </AppText>
      <View
        style={[styles.preview, { backgroundColor: hero.end, borderColor: colors.border }]}
        accessibilityLabel="Prévia do banner"
      >
        {bannerKey && preview ? (
          <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: hero.start, opacity: 0.6 }]} />
        )}
        <View
          style={[
            styles.previewTag,
            { backgroundColor: bannerKey ? colors.mediaScrim : hero.glass },
          ]}
        >
          <AppText variant="caption" style={{ color: bannerKey ? colors.onMedia : hero.text }}>
            CAMPANHA
          </AppText>
        </View>
      </View>
      <View style={styles.swatches} accessibilityRole="radiogroup">
        {bannerColorChoices.map((choice) => {
          const selected = choice.value === color;
          return (
            <Touchable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`Cor ${choice.label}`}
              onPress={() => onColor(choice.value)}
              style={styles.swatchCell}
            >
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: heroes[choice.value].start,
                    borderColor: selected ? colors.text : colors.border,
                    borderWidth: selected ? 3 : 1,
                  },
                ]}
              />
              <AppText variant="caption" color={selected ? 'text' : 'textSecondary'}>
                {choice.label}
              </AppText>
            </Touchable>
          );
        })}
      </View>
      {bannerKey ? (
        <View style={styles.row}>
          <AppText variant="bodySmall" color="textSecondary" style={styles.grow}>
            Foto do banner escolhida. A cor aparece por baixo enquanto a foto carrega.
          </AppText>
          <IconButton
            icon="x"
            accessibilityLabel="Tirar a foto do banner"
            onPress={() => {
              setPreview(null);
              onBanner(null);
            }}
          />
        </View>
      ) : (
        <Button
          title={uploading ? 'Enviando a foto...' : 'Escolher foto do banner (opcional)'}
          icon="image"
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
  preview: {
    height: 96,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    padding: spacing.sm,
  },
  previewTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatchCell: { alignItems: 'center', gap: 2, minWidth: 56 },
  swatch: { width: 36, height: 36, borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
});
