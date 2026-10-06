import { Image, StyleSheet, View } from 'react-native';
import { pawSource, type Urgency } from '../map/paw';

/** Pino fixo no centro. A cor segue a urgência escolhida. */
export function PawPin({ urgency }: { urgency: Urgency }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wrap}
    >
      <Image source={pawSource[urgency]} style={styles.paw} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  paw: { width: 64, height: 64 },
});
