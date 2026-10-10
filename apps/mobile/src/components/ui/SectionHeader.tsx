import { StyleSheet, View } from 'react-native';
import { radius, size, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Title of a block: big title in the brand font, with a pill to see everything on the right. */
export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText variant="h2">{title}</AppText>
        {subtitle ? (
          <AppText variant="bodySmall" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          pressedScale={0.95}
          onPress={onAction}
          style={[styles.action, { backgroundColor: colors.primarySoft }]}
        >
          <AppText variant="bodySmallStrong" style={{ color: colors.onPrimarySoft }}>
            {actionLabel}
          </AppText>
          <Icon name="chevron-right" size="sm" color={colors.onPrimarySoft} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
  },
  text: { flex: 1 },
  action: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
});
