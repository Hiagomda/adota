import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useOverlay } from './useOverlay';

export interface AppModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Hides the close button and ignores backdrop taps (used by confirmations). */
  dismissable?: boolean;
}

/** Centered modal with fade + scale. */
export function AppModal({ visible, onClose, title, children, dismissable = true }: AppModalProps) {
  const { colors, shadows } = useTheme();
  const { mounted, progress } = useOverlay(visible);
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.94, 1]) }],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdrop]}>
          {dismissable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              style={StyleSheet.absoluteFill}
              onPress={onClose}
            />
          ) : null}
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.card, shadows.lg, { backgroundColor: colors.surfaceRaised }, card]}
        >
          {title || dismissable ? (
            <View style={styles.header}>
              <AppText variant="h3" style={styles.title}>
                {title ?? ''}
              </AppText>
              {dismissable ? (
                <IconButton icon="x" accessibilityLabel="Fechar" onPress={onClose} />
              ) : null}
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1 },
});
