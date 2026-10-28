import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { AppModal, AppText, Button, PawBurst } from '../components/ui';
import { spacing } from '../theme';
import type { CupuCelebrationMoment } from './celebration';
import { Cupu } from './Cupu';

const CELEBRATION_SIZE = 168;

/** Comemoração curta com o Cupu, com o cenário e o enfeite que a pessoa escolheu. */
export function CupuCelebration({
  moment,
  onClose,
}: {
  moment: CupuCelebrationMoment | null;
  onClose: () => void;
}) {
  // A última comemoração fica guardada para o modal sair com o texto, sem piscar vazio.
  const [shown, setShown] = useState(moment);
  const [burst, setBurst] = useState(0);
  if (moment && moment !== shown) {
    setShown(moment);
    setBurst((count) => count + 1);
  }
  useEffect(() => {
    if (moment) AccessibilityInfo.announceForAccessibility(`${moment.title} ${moment.body}`);
  }, [moment]);

  return (
    <AppModal visible={moment !== null} onClose={onClose}>
      {shown ? (
        <View style={styles.body}>
          <View>
            <Cupu size={CELEBRATION_SIZE} pose={shown.pose} interactive />
            <PawBurst trigger={burst} size={24} />
          </View>
          <AppText variant="h2" style={styles.center}>
            {shown.title}
          </AppText>
          <AppText color="textSecondary" style={styles.center}>
            {shown.body}
          </AppText>
          <Button title="Bora!" fullWidth onPress={onClose} />
        </View>
      ) : null}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm },
  center: { textAlign: 'center' },
});
