import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

export interface PhotoScrimProps {
  /** How far from the clear side the gradient starts: 0 is the dark edge, 1 the far side. */
  stop?: number;
  /** Which edge of the photo gets the dark part. */
  edge?: 'bottom' | 'top';
}

/**
 * Dark gradient from transparent to almost opaque, laid over an edge of a photo so the name
 * and info (or the buttons) drawn on top of it stay readable.
 */
export function PhotoScrim({ stop = 0.4, edge = 'bottom' }: PhotoScrimProps) {
  const { colors } = useTheme();
  // One id per look: on the web, ids are global and two different gradients must not share one.
  const id = `photo-scrim-${edge}-${Math.round(stop * 100)}`;
  const darkAtBottom = edge === 'bottom';
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
        <LinearGradient id={id} x1="0" y1={darkAtBottom ? 0 : 1} x2="0" y2={darkAtBottom ? 1 : 0}>
          <Stop offset={stop} stopColor={colors.photoScrim} stopOpacity={0} />
          <Stop offset={1} stopColor={colors.photoScrim} stopOpacity={0.92} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
