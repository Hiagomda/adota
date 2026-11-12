import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { radius, spacing, useTheme } from '../theme';

/**
 * QR code do "Pix copia e cola". Desenhado em SVG (um só caminho), sempre preto no branco, que é o
 * que a câmera do banco lê melhor, inclusive no tema escuro.
 */
export function PixQr({ payload, size = 200 }: { payload: string; size?: number }) {
  const { colors } = useTheme();
  // Branco e preto nos dois temas: onMedia é sempre branco e mediaBackground sempre preto.
  const light = colors.onMedia;
  const dark = colors.mediaBackground;
  const { path, cells } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(payload);
    code.make();
    const count = code.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (code.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { path: d, cells: count };
  }, [payload]);
  // Margem de 4 módulos em volta, como o padrão do QR pede.
  const box = cells + 8;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="QR code do Pix. Abra o app do banco, escolha pagar com Pix e aponte a câmera."
      style={{
        width: size + spacing.md,
        height: size + spacing.md,
        padding: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: light,
        alignSelf: 'center',
      }}
    >
      <Svg width={size} height={size} viewBox={`-4 -4 ${box} ${box}`}>
        <Rect x={-4} y={-4} width={box} height={box} fill={light} />
        <Path d={path} fill={dark} />
      </Svg>
    </View>
  );
}
