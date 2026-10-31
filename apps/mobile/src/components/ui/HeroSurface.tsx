import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { PET_PATTERN_ID, PetPatternDef } from './PetPattern';
import { size, useTheme } from '../../theme';

const GRADIENT_ID = 'hero-gradient';

export interface HeroSurfaceProps {
  children: ReactNode;
  /** Wavy bottom edge. The content must leave `size.curve` of room at the bottom. */
  curved?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Outras cores para o degradê (ex.: a cor escolhida pela ONG). Sem elas, vale o turquesa. */
  start?: string;
  end?: string;
  /** Desenha a textura de ossinho e peixinho dentro da onda, nesta cor. */
  patternColor?: string;
}

/**
 * Turquoise gradient with the bone-and-fish texture, used behind headers. The shape is drawn with SVG
 * from the measured size, so the wave has the same depth on every screen.
 */
export function HeroSurface({
  children,
  curved = true,
  style,
  start,
  end,
  patternColor,
}: HeroSurfaceProps) {
  const { colors } = useTheme();
  const [box, setBox] = useState({ width: 0, height: 0 });

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }

  const { width, height } = box;
  const depth = curved ? size.curve : 0;
  // The control point sits `depth` below the bottom so the middle of the wave touches `height`.
  const shape = curved
    ? `M0 0 H${width} V${height - depth} Q${width / 2} ${height + depth} 0 ${height - depth} Z`
    : `M0 0 H${width} V${height} H0 Z`;

  return (
    <View onLayout={onLayout} style={style}>
      <Svg
        style={StyleSheet.absoluteFill}
        width={width}
        height={height}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          <LinearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={start ?? colors.heroStart} />
            <Stop offset="1" stopColor={end ?? colors.heroEnd} />
          </LinearGradient>
          {patternColor ? <PetPatternDef color={patternColor} /> : null}
        </Defs>
        <Path d={shape} fill={`url(#${GRADIENT_ID})`} />
        {patternColor ? <Path d={shape} fill={`url(#${PET_PATTERN_ID})`} opacity={0.12} /> : null}
      </Svg>
      {children}
    </View>
  );
}
