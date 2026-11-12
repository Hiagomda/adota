import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Besourinho (joaninha) do botão de avisar bug. O Feather não tem ícone de inseto, então ele é
 * desenhado aqui com as cores do tema: casco coral com pintas escuras, e cabeça, antenas e
 * perninhas na cor do texto, para aparecer tanto no tema claro quanto no escuro.
 */
export function BugIcon({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  // Pintas e risco do casco ficam sobre o coral: sempre escuros (texto escuro sobre coral).
  const dark = colors.onSecondary;
  // Cabeça, antenas e perninhas ficam sobre o fundo do botão: seguem a cor do texto.
  const line = colors.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {/* Antenas */}
      <Path
        d="M9.6 5.2 7.6 2.6M14.4 5.2l2-2.6"
        stroke={line}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      {/* Perninhas */}
      <Path
        d="M5.2 11 2.8 10M5 15.2 2.6 16.4M18.8 11l2.4-1M19 15.2l2.4 1.2"
        stroke={line}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={12} cy={6.6} rx={3.6} ry={2.8} fill={line} />
      <Ellipse cx={12} cy={14} rx={7.2} ry={7.4} fill={colors.secondary} />
      <Path d="M12 6.8v14.6" stroke={dark} strokeWidth={1.3} />
      <Circle cx={8.6} cy={11.6} r={1.4} fill={dark} />
      <Circle cx={15.4} cy={11.6} r={1.4} fill={dark} />
      <Circle cx={8.9} cy={16.6} r={1.2} fill={dark} />
      <Circle cx={15.1} cy={16.6} r={1.2} fill={dark} />
    </Svg>
  );
}
