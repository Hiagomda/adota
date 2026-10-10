import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './tones';
import { Touchable } from './Touchable';

export interface NoticeProps {
  message: string;
  tone?: Extract<Tone, 'info' | 'success' | 'warning' | 'error'>;
  /** Optional way out, e.g. "Abrir configurações" next to a blocked permission. */
  action?: { label: string; onPress: () => void };
}

const icons: Record<NonNullable<NoticeProps['tone']>, IconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'alert-circle',
};

/** Inline message that stays on screen (unlike Toast): form feedback, screen status. */
export function Notice({ message, tone = 'info', action }: NoticeProps) {
  const { colors } = useTheme();
  const { background, foreground } = toneColors(colors, tone);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: background }]}
    >
      <Icon name={icons[tone]} color={foreground} />
      <View style={styles.text}>
        <AppText variant="bodySmall" style={{ color: foreground }}>
          {message}
        </AppText>
        {action ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={styles.action}
          >
            <AppText variant="button" style={{ color: foreground }}>
              {action.label}
            </AppText>
          </Touchable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  text: { flex: 1, gap: spacing.xs },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});
