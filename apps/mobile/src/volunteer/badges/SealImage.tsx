import { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  FeColorMatrix,
  Filter,
  G,
  Image as SvgImage,
  Path,
  Rect,
} from 'react-native-svg';

export type BadgeProps = {
  /** Tamanho (largura = altura) em px. Padrão: 80 */
  size?: number;
  /** Se false, o selo fica cinza com cadeado. Padrão: true */
  unlocked?: boolean;
};

type Props = BadgeProps & {
  source: ImageSourcePropType;
};

let uidCounter = 0;

export default function SealImage({ source, size = 80, unlocked = true }: Props) {
  const uid = useMemo(() => `s${++uidCounter}`, []);

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Defs>
        <ClipPath id={`clip${uid}`}>
          <Circle cx={100} cy={100} r={100} />
        </ClipPath>
        <Filter id={`gray${uid}`}>
          <FeColorMatrix type="saturate" values="0" />
        </Filter>
      </Defs>
      <G clipPath={`url(#clip${uid})`} filter={unlocked ? undefined : `url(#gray${uid})`}>
        <SvgImage href={source} width={200} height={200} preserveAspectRatio="xMidYMid slice" />
      </G>
      {!unlocked && (
        <G transform="translate(158 42)">
          <Circle r={18} fill="#3A3A3A" stroke="#FFFFFF" strokeWidth={2.5} />
          <Rect x={-7} y={-1} width={14} height={11} rx={2.5} fill="#FFFFFF" />
          <Path d="M -4.5 -1 V -5 A 4.5 4.5 0 0 1 4.5 -5 V -1" fill="none" stroke="#FFFFFF" strokeWidth={2.8} />
        </G>
      )}
    </Svg>
  );
}
