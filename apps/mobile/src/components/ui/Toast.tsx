import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { contentMaxWidth, motion, radius, spacing, useMotionDuration, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors } from './tones';

type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons: Record<ToastTone, IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

const VISIBLE_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const duration = useMotionDuration();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    counter.current += 1;
    setToast({ id: counter.current, message, tone });
    if (tone === 'error') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);
  const palette = toast ? toneColors(colors, toast.tone) : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && palette ? (
        <View
          pointerEvents="none"
          style={[styles.host, { top: insets.top + spacing.sm }]}
        >
          <Animated.View
            key={toast.id}
            entering={FadeInUp.duration(duration(motion.base))}
            exiting={FadeOutUp.duration(duration(motion.fast))}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.toast, shadows.md, { backgroundColor: palette.background }]}
          >
            <Icon name={icons[toast.tone]} color={palette.foreground} />
            <AppText variant="bodySmallStrong" style={[styles.text, { color: palette.foreground }]}>
              {toast.message}
            </AppText>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  toast: {
    width: '100%',
    maxWidth: contentMaxWidth,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  text: { flex: 1 },
});
