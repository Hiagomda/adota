import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/ui';
import { radius, spacing, statusLabel, useTheme } from '../theme';
import { journeyOf } from './journey';

const BAR_HEIGHT = 6;

/** "Caminho do resgate": how far the animal is from a home, and what comes next. */
export function RescueJourney({ type, status }: { type: string; status: string }) {
  const { colors } = useTheme();
  const journey = journeyOf(type, status);
  if (!journey) return null;
  const { steps, current, notFound, next } = journey;
  const currentLabel = notFound ? statusLabel.not_found : statusLabel[steps[current] ?? ''];
  const nextLine = next ? `Próximo passo: ${statusLabel[next]}` : 'Chegou ao fim do caminho.';
  return (
    <View
      accessible
      accessibilityLabel={`Caminho do resgate, etapa ${current + 1} de ${steps.length}: ${currentLabel}. ${nextLine}`}
      style={styles.wrap}
    >
      <View style={styles.header}>
        <AppText variant="bodySmallStrong">{currentLabel}</AppText>
        <AppText variant="caption" color="textSecondary">
          Etapa {current + 1} de {steps.length}
        </AppText>
      </View>
      <View style={styles.bars}>
        {steps.map((step, index) => (
          <View
            key={step}
            style={[
              styles.bar,
              {
                backgroundColor:
                  index < current
                    ? colors.primary
                    : index === current
                      ? notFound
                        ? colors.warning
                        : colors.primary
                      : colors.border,
              },
            ]}
          />
        ))}
      </View>
      <AppText variant="caption" color="textSecondary">
        {nextLine}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bars: { flexDirection: 'row', gap: spacing.xs },
  bar: { flex: 1, height: BAR_HEIGHT, borderRadius: radius.pill },
});
