import { StyleSheet, View } from 'react-native';
import { spacing, useTheme } from '../../theme';

export function Divider({ inset = false }: { inset?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.line,
        { backgroundColor: colors.border },
        inset ? { marginLeft: spacing.lg } : null,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
