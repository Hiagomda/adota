import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatAppVersion } from '../appVersion';
import { currentReleaseNotes } from '../updates/releaseNotes';
import { AppText, BottomSheet, Button, Touchable } from '../components/ui';
import { reportError } from '../crash/reporter';
import { radius, size, spacing, useTheme } from '../theme';
import { diagnosticRows, diagnosticText } from './snapshot';

const TAPS_TO_OPEN = 5;
const TAP_WINDOW_MS = 1_800;
const COPIED_MS = 2_500;

/**
 * Always-visible version line. Five taps in a short window open the diagnostics sheet
 * so a tester can copy exactly which APK they installed, without a hidden menu.
 */
export function VersionMark() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const taps = useRef(0);
  const windowStarted = useRef(0);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  function onTap() {
    const now = Date.now();
    if (now - windowStarted.current > TAP_WINDOW_MS) {
      taps.current = 0;
      windowStarted.current = now;
    }
    taps.current += 1;
    if (taps.current < TAPS_TO_OPEN) return;
    taps.current = 0;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setOpen(true);
  }

  async function copy() {
    try {
      await Clipboard.setStringAsync(diagnosticText());
      setCopied(true);
    } catch (error) {
      reportError(error, { source: 'handled', where: 'diagnostics:clipboard' });
    }
  }

  const rows = open ? diagnosticRows() : [];
  const label = `Égua, adota! ${formatAppVersion()}`;

  return (
    <>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`Versão ${formatAppVersion()}. Toque cinco vezes para o diagnóstico.`}
        accessibilityHint="Cinco toques abrem o painel com build, aparelho e endereço da API"
        haptic={false}
        onPress={onTap}
        style={styles.hit}
      >
        <AppText variant="caption" color="textSecondary" style={styles.caption}>
          {label}
        </AppText>
      </Touchable>
      <View style={styles.notes}>
        {currentReleaseNotes.map((note) => (
          <AppText key={note} variant="caption" color="textSecondary" style={styles.caption}>
            {note}
          </AppText>
        ))}
      </View>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Diagnóstico">
        <AppText color="textSecondary">
          Isso identifica o aplicativo instalado neste aparelho. Pode copiar e mandar no suporte.
        </AppText>
        <View style={[styles.panel, { backgroundColor: colors.surfaceMuted }]}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <AppText variant="caption" color="textSecondary">
                {row.label}
              </AppText>
              <AppText variant="bodySmallStrong" selectable>
                {row.value}
              </AppText>
            </View>
          ))}
        </View>
        <Button
          title={copied ? 'Copiado' : 'Copiar o diagnóstico'}
          icon={copied ? 'check' : 'copy'}
          variant="secondary"
          fullWidth
          onPress={() => void copy()}
        />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  hit: {
    minHeight: size.touch,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  caption: { textAlign: 'center' },
  notes: { gap: spacing.xs, paddingBottom: spacing.sm },
  panel: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  row: { gap: 2 },
});
