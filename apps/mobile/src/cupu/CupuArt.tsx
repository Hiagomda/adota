import { useId } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import { scale, useTheme } from '../theme';
import type { CupuAccessory as CupuAccessoryCode, CupuScene as CupuSceneCode } from './catalog';

/**
 * Cenários e enfeites do Cupu, desenhados num quadro de 100 x 100. O cenário fica atrás da
 * ilustração dele, dentro de um círculo; o enfeite fica por cima, nas bordas, sem cobrir o rosto.
 * As cores vêm do tema, então o tema escuro troca os tons sozinho.
 */

const SPARKLE = 'M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z';
const HEART =
  'M0 3.5 C-5 0 -5 -4.5 -2.4 -4.5 C-1.2 -4.5 -0.4 -3.7 0 -3 C0.4 -3.7 1.2 -4.5 2.4 -4.5 C5 -4.5 5 0 0 3.5 Z';

export function CupuScene({ scene, size }: { scene: CupuSceneCode; size: number }) {
  const { colors } = useTheme();
  // Um id por desenho: no app web dois cenários na mesma tela não podem dividir o recorte.
  const clipId = `cupu-scene-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx="50" cy="50" r="49" />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        {scene === 'creme' ? (
          <>
            <Rect width="100" height="100" fill={colors.caramelSoft} />
            <Ellipse cx="50" cy="96" rx="44" ry="12" fill={colors.surfaceMuted} />
          </>
        ) : null}
        {scene === 'mangueiras' ? (
          <>
            <Rect width="100" height="100" fill={colors.successSoft} />
            <Ellipse cx="14" cy="8" rx="26" ry="18" fill={colors.success} opacity={0.55} />
            <Ellipse cx="86" cy="10" rx="24" ry="17" fill={colors.success} opacity={0.55} />
            <Ellipse cx="50" cy="-2" rx="22" ry="12" fill={colors.success} opacity={0.4} />
            <Ellipse cx="20" cy="22" rx="3" ry="4" fill={colors.caramel} />
            <Ellipse cx="80" cy="25" rx="3" ry="4" fill={colors.warning} />
            <Ellipse cx="50" cy="96" rx="48" ry="13" fill={colors.success} opacity={0.35} />
          </>
        ) : null}
        {scene === 'guajara' ? (
          <>
            <Rect width="100" height="100" fill={colors.infoSoft} />
            <Circle cx="78" cy="22" r="9" fill={colors.warning} opacity={0.85} />
            <Path
              d="M0 74 Q12 69 25 74 T50 74 T75 74 T100 74 V100 H0 Z"
              fill={colors.primary}
              opacity={0.35}
            />
            <Path
              d="M0 84 Q12 79 25 84 T50 84 T75 84 T100 84 V100 H0 Z"
              fill={colors.primary}
              opacity={0.55}
            />
          </>
        ) : null}
        {scene === 'por_do_sol' ? (
          <>
            <Rect width="100" height="100" fill={colors.secondarySoft} />
            <Circle cx="50" cy="70" r="26" fill={colors.caramel} opacity={0.55} />
            <Circle cx="50" cy="70" r="17" fill={colors.secondary} opacity={0.55} />
            <Rect y="74" width="100" height="26" fill={colors.primary} opacity={0.5} />
            <Path
              d="M10 82 H34 M60 88 H90 M22 93 H70"
              stroke={colors.caramelSoft}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        ) : null}
        {scene === 'noite' ? (
          <>
            {/* A noite é escura nos dois temas. */}
            <Rect width="100" height="100" fill={scale.turquoise[900]} />
            <Circle cx="76" cy="20" r="9" fill={scale.caramel[100]} />
            <Circle cx="80" cy="17" r="8" fill={scale.turquoise[900]} />
            {[
              [16, 18, 0.5],
              [30, 34, 0.35],
              [58, 12, 0.4],
              [88, 44, 0.35],
              [12, 52, 0.3],
            ].map(([x, y, s]) => (
              <Path
                key={`${x}-${y}`}
                d={SPARKLE}
                fill={colors.warning}
                transform={`translate(${x} ${y}) scale(${s})`}
              />
            ))}
            <Ellipse cx="50" cy="96" rx="44" ry="12" fill={scale.turquoise[700]} />
          </>
        ) : null}
      </G>
    </Svg>
  );
}

export function CupuAccessory({ accessory, size }: { accessory: CupuAccessoryCode; size: number }) {
  const { colors } = useTheme();
  if (accessory === 'none') return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {accessory === 'fitinhas' ? (
        <>
          {/* As fitinhas do Círio penduradas num cordão por cima do Cupu. */}
          <Path d="M4 16 Q50 -2 96 16" stroke={colors.borderStrong} strokeWidth="1.2" fill="none" />
          {[
            [12, 12.5, colors.secondary],
            [24, 8.5, colors.caramel],
            [36, 6.4, colors.primary],
            [64, 6.4, colors.success],
            [76, 8.5, colors.warning],
            [88, 12.5, colors.info],
          ].map(([x, y, color], index) => (
            <Path
              key={String(x)}
              d={`M${x} ${y} q${index % 2 ? 3 : -3} 6 0 12 q${index % 2 ? -3 : 3} 5 0 10`}
              stroke={String(color)}
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </>
      ) : null}
      {accessory === 'estrelas' ? (
        <>
          {[
            [12, 18, 1],
            [88, 14, 0.8],
            [92, 52, 0.6],
            [8, 58, 0.7],
          ].map(([x, y, s]) => (
            <Path
              key={`${x}-${y}`}
              d={SPARKLE}
              fill={colors.warning}
              transform={`translate(${x} ${y}) scale(${s})`}
            />
          ))}
        </>
      ) : null}
      {accessory === 'coracoes' ? (
        <>
          {[
            [14, 20, 1.5],
            [86, 16, 1.2],
            [90, 44, 0.9],
            [10, 48, 0.8],
          ].map(([x, y, s]) => (
            <Path
              key={`${x}-${y}`}
              d={HEART}
              fill={colors.secondary}
              transform={`translate(${x} ${y}) scale(${s})`}
            />
          ))}
        </>
      ) : null}
      {accessory === 'medalha' ? (
        <G transform="translate(84 76)">
          <Path
            d="M-6 -16 L-2 -4 M6 -16 L2 -4"
            stroke={colors.primary}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <Circle r="8.5" fill={colors.caramel} stroke={colors.onCaramelSoft} strokeWidth="1.2" />
          <Path d={SPARKLE} fill={colors.caramelSoft} transform="scale(0.8)" />
        </G>
      ) : null}
      {accessory === 'coroa' ? (
        <G>
          {/* Folhas em arco por cima, como uma coroa de louros. */}
          {Array.from({ length: 7 }, (_, index) => {
            const angle = -150 + index * 20;
            const radians = (angle * Math.PI) / 180;
            const x = 50 + Math.cos(radians) * 46;
            const y = 52 + Math.sin(radians) * 46;
            return (
              <Ellipse
                key={angle}
                cx={x}
                cy={y}
                rx="6"
                ry="2.6"
                fill={index % 2 ? colors.success : colors.onSuccessSoft}
                transform={`rotate(${angle + 90} ${x} ${y})`}
              />
            );
          })}
        </G>
      ) : null}
    </Svg>
  );
}
