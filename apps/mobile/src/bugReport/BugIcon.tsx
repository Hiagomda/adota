import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useTheme } from '../theme';

/**
 * Besourinho (joaninha) do botão de avisar bug. O Feather não tem ícone de inseto, então ele é
 * desenhado aqui com as cores do tema: casco coral e cabeça e pintas escuras.
 */
export function BugIcon({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  const dark = colors.onSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {/* Antenas */}
      <Path
        d="M9.6 5.2 7.6 2.6M14.4 5.2l2-2.6"
        stroke={dark}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      {/* Perninhas */}
      <Path
        d="M5.2 11 2.8 10M5 15.2 2.6 16.4M18.8 11l2.4-1M19 15.2l2.4 1.2"
        stroke={dark}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={12} cy={6.6} rx={3.6} ry={2.8} fill={dark} />
      <Ellipse cx={12} cy={14} rx={7.2} ry={7.4} fill={colors.secondary} />
      <Path d="M12 6.8v14.6" stroke={dark} strokeWidth={1.3} />
      <Circle cx={8.6} cy={11.6} r={1.4} fill={dark} />
      <Circle cx={15.4} cy={11.6} r={1.4} fill={dark} />
      <Circle cx={8.9} cy={16.6} r={1.2} fill={dark} />
      <Circle cx={15.1} cy={16.6} r={1.2} fill={dark} />
    </Svg>
  );
}
