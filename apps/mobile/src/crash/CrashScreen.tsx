import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, MarajoaraPattern } from '../components/ui';
import { VersionMark } from '../diagnostics/VersionMark';
import { Mascot } from '../mascot';
import { radius, screenColumn, size, spacing, useTheme } from '../theme';
import { describeError, errorCode, errorReportText } from './errorInfo';

export interface CrashScreenProps {
  error: unknown;
  /** Id returned by the crash reporter, when it is on. */
  eventId: string | null;
  onRetry: () => void;
  /** Section version: no safe area, fits inside a screen. */
  inline?: boolean;
  /** What the retry does, e.g. "Tentar de novo" or "Recarregar o app". */
  retryLabel?: string;
}

const COPIED_MS = 2500;
const PATTERN_OPACITY = 0.1;

/**
 * Shown when a part of the app threw. It never hides the error: the code and the version are
 * visible so the person can report exactly what broke, and the stack can be copied.
 *
 * Only depends on the theme hook, so it renders even when the providers above it failed.
 */
export function CrashScreen({
  error,
  eventId,
  onRetry,
  inline = false,
  retryLabel = 'Tentar de novo',
}: CrashScreenProps) {
  const { colors, shadows } = useTheme();
  const [copied, setCopied] = useState(false);
  const info = describeError(error);
  const code = errorCode(error);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await Clipboard.setStringAsync(errorReportText(error, eventId));
      setCopied(true);
    } catch (copyError) {
      console.warn('[crash] clipboard unavailable', describeError(copyError).message);
    }
  }

  const body = (
    <View style={[styles.column, inline ? styles.inlineColumn : null]}>
      <View style={[shadows.sm, styles.shadow, { backgroundColor: colors.surfaceRaised }]}>
        <View style={styles.panel}>
          <MarajoaraPattern color={colors.primary} opacity={PATTERN_OPACITY} />
          <View style={styles.content} accessibilityRole="alert">
            <Mascot pose="sad" size={size.mascot} label="Cupu triste" />
            <AppText variant="h2" style={styles.center}>
              Égua, deu ruim aqui
            </AppText>
            <AppText color="textSecondary" style={styles.center}>
              Essa parte do app parou de responder. Nada que você fez foi perdido. Toque em tentar
              de novo e, se continuar, mande o código abaixo para a gente.
            </AppText>
            <View style={[styles.codeBox, { backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="bodySmallStrong" selectable>
                Código {code}
              </AppText>
              <AppText variant="caption" color="textSecondary" selectable numberOfLines={3}>
                {info.name}: {info.message}
              </AppText>
              {eventId ? (
                <AppText variant="caption" color="textSecondary" selectable numberOfLines={1}>
                  Evento {eventId}
                </AppText>
              ) : null}
            </View>
            <View style={styles.actions}>
              <Button title={retryLabel} icon="refresh-cw" fullWidth onPress={onRetry} />
              <Button
                title={copied ? 'Copiado' : 'Copiar o código do erro'}
                icon={copied ? 'check' : 'copy'}
                variant="ghost"
                fullWidth
                accessibilityLabel="Copiar o código do erro para enviar ao suporte"
                onPress={() => void copy()}
              />
            </View>
            <VersionMark />
          </View>
        </View>
      </View>
    </View>
  );

  if (inline) return <View style={styles.inlineOuter}>{body}</View>;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  inlineOuter: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  column: { ...screenColumn },
  inlineColumn: { paddingHorizontal: 0 },
  shadow: { borderRadius: radius.xxl },
  panel: { borderRadius: radius.xxl, overflow: 'hidden' },
  content: { padding: spacing.xxl, gap: spacing.md, alignItems: 'center' },
  center: { textAlign: 'center' },
  codeBox: {
    width: '100%',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: { width: '100%', gap: spacing.sm, paddingTop: spacing.sm },
});
