import { StyleSheet } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

export const MARAJOARA_PATTERN_ID = 'marajoara';
const TILE = 44;
const MID = TILE / 2;
const STROKE = 1.5;

/**
 * Tile of the marajoara motif (nested diamonds with a stepped center), meant to be placed inside
 * a `<Defs>` and used as `fill="url(#marajoara)"`. Pieces of the Marajó pottery, drawn in lines.
 */
export function MarajoaraPatternDef({ color }: { color: string }) {
  return (
    <Pattern id={MARAJOARA_PATTERN_ID} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
      <Path
        d={`M${MID} 2 L${TILE - 2} ${MID} L${MID} ${TILE - 2} L2 ${MID} Z`}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
      />
      <Path
        d={`M${MID} 10 L${TILE - 10} ${MID} L${MID} ${TILE - 10} L10 ${MID} Z`}
        stroke={color}
        strokeWidth={STROKE}
        fill="none"
      />
      <Path
        d={`M${MID} 17 L${MID + 5} ${MID} L${MID} ${MID + 5} L${MID - 5} ${MID} Z`}
        fill={color}
      />
      <Rect x={0} y={0} width={4} height={4} fill={color} />
      <Rect x={TILE - 4} y={0} width={4} height={4} fill={color} />
      <Rect x={0} y={TILE - 4} width={4} height={4} fill={color} />
      <Rect x={TILE - 4} y={TILE - 4} width={4} height={4} fill={color} />
    </Pattern>
  );
}

/** Subtle marajoara texture that fills its parent. Decorative: hidden from screen readers. */
export function MarajoaraPattern({ color, opacity = 0.1 }: { color: string; opacity?: number }) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <MarajoaraPatternDef color={color} />
      </Defs>
      <Rect
        width="100%"
        height="100%"
        fill={`url(#${MARAJOARA_PATTERN_ID})`}
        opacity={opacity}
      />
    </Svg>
  );
}
