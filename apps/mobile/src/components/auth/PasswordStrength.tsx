import { StyleSheet, View } from 'react-native';
import { AppText } from '../ui';
import { passwordStrength, type PasswordStrength } from '../../auth/validation';
import { radius, spacing, useTheme } from '../../theme';

const label: Record<Exclude<PasswordStrength, 'empty'>, string> = {
  weak: 'Fraca',
  medium: 'Média',
  strong: 'Forte',
};

export function PasswordStrengthBar({ password }: { password: string }) {
  const { colors } = useTheme();
  const strength = passwordStrength(password);
  if (strength === 'empty') return null;
  const fill = strength === 'weak' ? 0.34 : strength === 'medium' ? 0.67 : 1;
  const color =
    strength === 'weak' ? colors.error : strength === 'medium' ? colors.caramel : colors.success;
  return (
    <View accessibilityLabel={`Força da senha: ${label[strength]}`} style={styles.row}>
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: color }]} />
      </View>
      <AppText variant="caption" style={{ color }}>
        {label[strength]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: { flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
