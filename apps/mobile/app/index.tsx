import { Redirect, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../src/components/ui';
import { Mascot } from '../src/mascot';
import { useSession } from '../src/session';
import { size, spacing, useTheme } from '../src/theme';

const GATE_MASCOT = size.mascot + spacing.xxxl;

export default function Gate() {
  const { colors } = useTheme();
  const ready = useSession((state) => state.ready);
  const token = useSession((state) => state.token);
  const permissionsSeen = useSession((state) => state.permissionsSeen);

  if (!ready) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Mascot pose="sit" size={GATE_MASCOT} label="Mascote do Égua, adota!" />
        <AppText variant="display" color="primary">
          Égua, adota!
        </AppText>
      </View>
    );
  }
  if (!token) return <Redirect href={'/welcome' as Href} />;
  if (!permissionsSeen) return <Redirect href="/permissions" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});
