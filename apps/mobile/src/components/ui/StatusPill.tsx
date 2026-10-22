import { StyleSheet, View } from 'react-native';
import { radius, spacing, statusLabel, urgencyLabel, useTheme } from '../../theme';
import { AppText } from './AppText';
import { toneColors, type Tone } from './tones';

const statusTone: Record<string, Tone> = {
  open: 'secondary',
  on_the_way: 'info',
  not_found: 'neutral',
  rescued: 'primary',
  fostered: 'caramel',
  for_adoption: 'warning',
  adopted: 'success',
};

const urgencyTone: Record<string, Tone> = {
  high: 'error',
  medium: 'warning',
  low: 'success',
};

/** Animal perdido tem família: enquanto some, está "Procurando"; achado, "Voltou para casa". */
const lostLabel: Record<string, string> = {
  open: 'Procurando',
  on_the_way: 'Procurando',
  not_found: 'Procurando',
  rescued: 'Voltou para casa',
};

export type StatusPillProps =
  { status: string; type?: string } | { urgency: 'high' | 'medium' | 'low' };

/** Pill for the rescue status (Aberto…Adotado) or the urgency (Urgente, Atenção, Pode esperar). */
export function StatusPill(props: StatusPillProps) {
  const { colors } = useTheme();
  const isUrgency = 'urgency' in props;
  const key = isUrgency ? props.urgency : props.status;
  const tone = (isUrgency ? urgencyTone[key] : statusTone[key]) ?? 'neutral';
  const lost = !isUrgency && props.type === 'lost';
  const label =
    (isUrgency ? urgencyLabel[key] : lost ? lostLabel[key] : undefined) ??
    (isUrgency ? undefined : statusLabel[key]) ??
    'Resgate';
  const { background, foreground } = toneColors(colors, tone);
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <View style={[styles.dot, { backgroundColor: foreground }]} />
      <AppText variant="caption" numberOfLines={1} style={{ color: foreground }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    // In a crowded row the pill keeps its label whole and the neighbors shrink instead.
    flexShrink: 0,
  },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
});
