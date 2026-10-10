import { StyleSheet } from 'react-native';
import { lightColors, radius, spacing } from '../../theme';
import { AppText, Touchable } from '../ui';
import { GoogleMark } from './GoogleMark';

/**
 * Brand button stays white with dark text in both themes, as the Google sign-in guidelines require.
 * The colors come from the light palette so dark mode does not invert them.
 */
export function GoogleButton({ onPress }: { onPress: () => void }) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="Continuar com Google"
      accessibilityHint="Entra com a sua conta Google"
      pressedScale={0.98}
      onPress={onPress}
      style={styles.button}
    >
      <GoogleMark />
      <AppText variant="button" style={{ color: lightColors.text }}>
        Continuar com Google
      </AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: lightColors.borderStrong,
    backgroundColor: lightColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
});
