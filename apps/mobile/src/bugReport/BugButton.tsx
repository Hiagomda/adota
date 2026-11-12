import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Touchable } from '../components/ui';
import { radius, size, useTheme } from '../theme';
import { BugIcon } from './BugIcon';

/** Abre a tela de avisar bug guardando a tela de onde a pessoa veio. */
export function useOpenBugReport(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  return () => router.push({ pathname: '/bug', params: { from: pathname } });
}

/**
 * Botão do besourinho no topo do Início. O app está em pleno desenvolvimento e o Cupu apresenta
 * este botão no primeiro login (CupuOnboarding).
 */
export function BugButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const open = useOpenBugReport();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="Achou um bug? Avise a gente"
      haptic="light"
      onPress={open}
      pressedScale={0.92}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? colors.surfaceMuted : colors.secondarySoft,
          borderColor: colors.secondary,
        },
        style,
      ]}
    >
      <BugIcon size={24} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
