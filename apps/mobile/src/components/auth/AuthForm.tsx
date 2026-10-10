import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Header, Notice } from '../ui';
import { screenColumn, spacing, useTheme } from '../../theme';

export function AuthForm({
  title,
  subtitle,
  notice,
  noticeTone = 'error',
  children,
  onBack,
}: {
  title: string;
  subtitle: string;
  notice: string | null;
  noticeTone?: 'error' | 'success' | 'info';
  children: ReactNode;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.column}>
            <Header title={title} onBack={onBack} />
            <AppText color="textSecondary">{subtitle}</AppText>
            {notice ? <Notice message={notice} tone={noticeTone} /> : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.giant },
  column: { ...screenColumn, width: '100%', gap: spacing.md },
});
