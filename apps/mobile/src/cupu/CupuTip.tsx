import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AppText, Button, Card, IconButton } from '../components/ui';
import { logBestEffort } from '../crash/bestEffort';
import { motion, spacing, useMotionDuration } from '../theme';
import { Cupu } from './Cupu';
import { useCupuTips } from './tipStorage';
import { nextTipIndex, tipIndexForDay, tipsFor, type CupuTipContext } from './tips';

const TIP_MASCOT = 64;

/**
 * Uma dica curta do Cupu no topo de uma tela calma. Fechar cala a dica daquela tela por uma
 * semana; em Ajustes dá para desligar todas.
 */
export function CupuTip({
  context,
  style,
}: {
  context: CupuTipContext;
  /** Margem em volta; some junto com a dica quando ela está fechada. */
  style?: StyleProp<ViewStyle>;
}) {
  const duration = useMotionDuration();
  const loaded = useCupuTips((state) => state.loaded);
  const enabled = useCupuTips((state) => state.enabled);
  const hidden = useCupuTips((state) => state.hidden[context] ?? false);
  const load = useCupuTips((state) => state.load);
  const snooze = useCupuTips((state) => state.snooze);
  const list = tipsFor(context);
  const [index, setIndex] = useState(() => tipIndexForDay(context, new Date()));

  useEffect(() => {
    load().catch(logBestEffort('cupu:tips-load'));
  }, [load]);

  const tip = list[index];
  if (!loaded || !enabled || hidden || !tip) return null;

  return (
    <Animated.View entering={FadeInDown.duration(duration(motion.slow))} style={style}>
      <Card padding="md">
        <View style={styles.row}>
          <Cupu size={TIP_MASCOT} pose="wave" scene={null} interactive />
          <View style={styles.text} accessibilityLiveRegion="polite">
            <AppText variant="caption" color="textSecondary">
              Dica do Cupu
            </AppText>
            <AppText variant="bodySmall">{tip.text}</AppText>
            {list.length > 1 ? (
              <Button
                title="Outra dica"
                variant="ghost"
                onPress={() => setIndex((current) => nextTipIndex(current, list.length))}
                style={styles.more}
              />
            ) : null}
          </View>
          <IconButton
            icon="x"
            accessibilityLabel="Fechar dica do Cupu por uma semana"
            onPress={() => snooze(context)}
          />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  more: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
