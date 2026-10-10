import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tones';

export type BadgeProps =
  | { kind: 'dot'; tone?: Tone; accessibilityLabel: string }
  | { kind: 'count'; count: number; tone?: Tone }
  | { kind: 'label'; label: string; tone?: Tone };

/** Static marker: a dot, a counter (99+) or a short label. */
export function Badge(props: BadgeProps) {
  const { colors } = useTheme();
  const tone = props.tone ?? 'neutral';
  const { background, foreground } = toneColors(colors, tone);
  if (props.kind === 'dot') {
    return (
      <View
        accessible
        accessibilityLabel={props.accessibilityLabel}
        style={[styles.dot, { backgroundColor: tone === 'neutral' ? colors.secondary : foreground }]}
      />
    );
  }
  const text = props.kind === 'count' ? (props.count > 99 ? '99+' : String(props.count)) : props.label;
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <AppText variant="caption" style={{ color: foreground }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  pill: {
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
