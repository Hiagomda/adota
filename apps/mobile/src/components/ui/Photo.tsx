import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { Icon, type IconSize } from './Icon';

export interface PhotoProps extends Omit<ImageProps, 'source' | 'style'> {
  uri: string | null | undefined;
  style?: ImageProps['style'];
  /** Tamanho do ícone quando a foto falta ou não carrega. */
  iconSize?: IconSize;
}

/**
 * Foto de animal com o mesmo estado vazio em todo o app: sem endereço ou quando o download
 * falha (sem internet, arquivo removido), aparece a superfície neutra com o ícone de câmera
 * riscada, em vez de um buraco em branco.
 */
export function Photo({ uri, style, iconSize = 'xl', accessibilityLabel, ...rest }: PhotoProps) {
  const { colors } = useTheme();
  // Guarda qual endereço falhou: numa lista reciclada a mesma célula recebe outra foto depois.
  const [failed, setFailed] = useState<string | null>(null);
  if (!uri || failed === uri) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel ?? 'Foto indisponível'}
        style={[
          style as StyleProp<ViewStyle>,
          styles.empty,
          { backgroundColor: colors.surfaceMuted },
        ]}
      >
        <Icon name="camera-off" size={iconSize} color={colors.textDisabled} />
      </View>
    );
  }
  return (
    <Image
      {...rest}
      accessibilityLabel={accessibilityLabel}
      source={{ uri }}
      style={style}
      onError={() => setFailed(uri)}
    />
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
