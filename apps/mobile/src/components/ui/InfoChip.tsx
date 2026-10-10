import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tones';

const CHIP_HEIGHT = 36;

export interface InfoChipProps {
  label: string;
  icon?: IconName;
  tone?: Tone;
}

/** Fact about an animal (age, size, sex): a colored pill that is read, not tapped. */
export function InfoChip({ label, icon, tone = 'neutral' }: InfoChipProps) {
  const { colors } = useTheme();
  const { background, foreground } = toneColors(colors, tone);
  return (
    <View accessible accessibilityLabel={label} style={[styles.chip, { backgroundColor: background }]}>
      {icon ? <Icon name={icon} size="sm" color={foreground} /> : null}
      <AppText variant="bodySmallStrong" style={{ color: foreground }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
});
