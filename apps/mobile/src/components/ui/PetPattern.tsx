import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, Pattern, Rect } from 'react-native-svg';

export const PET_PATTERN_ID = 'pet-pattern';
const TILE = 64;

/** A dog bone lying along the x axis, centered on 0,0. */
function Bone({ color }: { color: string }) {
  return (
    <>
      <Rect x={-7} y={-2} width={14} height={4} rx={1} fill={color} />
      <Circle cx={-8} cy={-2.6} r={3} fill={color} />
      <Circle cx={-8} cy={2.6} r={3} fill={color} />
      <Circle cx={8} cy={-2.6} r={3} fill={color} />
      <Circle cx={8} cy={2.6} r={3} fill={color} />
    </>
  );
}

/** A small fish facing left, centered on 0,0. */
function Fish({ color }: { color: string }) {
  return (
    <>
      <Ellipse cx={-1} cy={0} rx={7.5} ry={4.5} fill={color} />
      <Path d="M5 0 L12 -5 L12 5 Z" fill={color} />
    </>
  );
}

/**
 * Tile with a bone and a fish (dog and cat), meant to be placed inside a `<Defs>` and used as
 * `fill="url(#pet-pattern)"`. Two of each per tile, turned different ways, so the repeat does not
 * read as a grid.
 */
export function PetPatternDef({ color }: { color: string }) {
  return (
    <Pattern id={PET_PATTERN_ID} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
      <G transform="translate(16 15) rotate(-35)">
        <Bone color={color} />
      </G>
      <G transform="translate(48 47) rotate(20)">
        <Bone color={color} />
      </G>
      <G transform="translate(49 16) rotate(15)">
        <Fish color={color} />
      </G>
      <G transform="translate(15 48) rotate(-20) scale(-1 1)">
        <Fish color={color} />
      </G>
    </Pattern>
  );
}

/** Subtle bone-and-fish texture that fills its parent. Decorative: hidden from screen readers. */
export function PetPattern({ color, opacity = 0.1 }: { color: string; opacity?: number }) {
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
        <PetPatternDef color={color} />
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${PET_PATTERN_ID})`} opacity={opacity} />
    </Svg>
  );
}
