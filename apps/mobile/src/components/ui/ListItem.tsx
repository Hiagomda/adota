import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  trailing?: ReactNode;
  showChevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function ListItem({
  title,
  subtitle,
  icon,
  trailing,
  showChevron = false,
  destructive = false,
  disabled = false,
  onPress,
  accessibilityLabel,
}: ListItemProps) {
  const { colors } = useTheme();
  const textColor = disabled ? 'textDisabled' : destructive ? 'errorText' : 'text';
  const iconColor = disabled
    ? colors.textDisabled
    : destructive
      ? colors.errorText
      : colors.onPrimarySoft;
  const content = (
    <>
      {icon ? (
        <View
          style={[
            styles.icon,
            { backgroundColor: destructive ? colors.errorSoft : colors.primarySoft },
          ]}
        >
          <Icon name={icon} color={iconColor} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText color={textColor}>{title}</AppText>
        {subtitle ? (
          <AppText variant="bodySmall" color="textSecondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {showChevron ? <Icon name="chevron-right" color={colors.textSecondary} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      pressedScale={0.99}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceMuted } : null,
      ]}
    >
      {content}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
