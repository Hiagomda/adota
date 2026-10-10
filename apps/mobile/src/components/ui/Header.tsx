import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { size, spacing } from '../../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Shows the back button. */
  onBack?: () => void;
  right?: ReactNode;
  /** Big title for the root screen of a tab. */
  large?: boolean;
}

/** Screen header. The screen is responsible for the top safe area. */
export function Header({ title, subtitle, onBack, right, large = false }: HeaderProps) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <IconButton icon="arrow-left" accessibilityLabel="Voltar" onPress={onBack} />
      ) : null}
      <View style={styles.text}>
        <AppText variant={large ? 'h1' : 'h3'} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.control + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  text: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center' },
});
