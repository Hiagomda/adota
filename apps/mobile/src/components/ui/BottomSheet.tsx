import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contentMaxWidth, motion, radius, spacing, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';
import { useOverlay } from './useOverlay';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const CLOSE_DRAG = 90;
const HIDDEN_OFFSET = 480;

/** Sheet that slides up, closes by tapping the backdrop, dragging the handle down or with Android back. */
export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const duration = useMotionDuration();
  const { mounted, progress } = useOverlay(visible);
  const drag = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > CLOSE_DRAG || event.velocityY > 800) {
        runOnJS(onClose)();
      }
      drag.value = withTiming(0, { duration: duration(motion.fast) });
    });

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [HIDDEN_OFFSET, 0]) + drag.value },
    ],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdrop]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
          pointerEvents="box-none"
        >
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              shadows.lg,
              {
                backgroundColor: colors.surfaceRaised,
                paddingBottom: Math.max(insets.bottom, spacing.lg),
              },
              sheet,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
                {title ? (
                  <AppText variant="h3" style={styles.title}>
                    {title}
                  </AppText>
                ) : null}
              </View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  keyboard: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: contentMaxWidth,
    maxHeight: '90%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  handleArea: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.sm },
  handle: { width: 40, height: 4, borderRadius: radius.pill },
  title: { alignSelf: 'flex-start', paddingTop: spacing.md, paddingBottom: spacing.sm },
});
