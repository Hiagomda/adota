import { StyleSheet, View } from 'react-native';
import { spacing } from '../../theme';
import { AppModal } from './AppModal';
import { AppText } from './AppText';
import { Button } from './Button';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button, for irreversible actions (delete account, block). */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppModal visible={visible} onClose={onCancel} dismissable={!loading}>
      <AppText variant="h2">{title}</AppText>
      <AppText color="textSecondary">{message}</AppText>
      <View style={styles.actions}>
        <Button
          title={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          loading={loading}
          fullWidth
          onPress={onConfirm}
        />
        <Button title={cancelLabel} variant="ghost" disabled={loading} fullWidth onPress={onCancel} />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, paddingTop: spacing.sm },
});
