import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Divider, Icon, useToast } from '../components/ui';
import { logBestEffort } from '../crash/bestEffort';
import { useSession } from '../session';
import { spacing, useTheme } from '../theme';
import { pendingLine, recordsFor } from './pendingRecords';
import { discardFailed, flushRecords, useRecordQueue } from './recordQueue';

/**
 * O que a pessoa registrou sem internet neste resgate e ainda não chegou ao servidor. Fica bem
 * visível para ninguém achar que o aviso foi dado quando não foi.
 */
export function PendingRecords({ postId, onSent }: { postId: string; onSent?: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const token = useSession((state) => state.token);
  const queue = useRecordQueue();
  const [sending, setSending] = useState(false);
  const pending = recordsFor(queue.pending, postId);
  const failed = recordsFor(queue.failed, postId);
  // A fila mandou sozinha (o relógio do app): a tela recarrega o diário e os avistamentos.
  const before = useRef(pending.length);
  useEffect(() => {
    if (pending.length < before.current) onSent?.();
    before.current = pending.length;
  }, [pending.length, onSent]);
  if (pending.length === 0 && failed.length === 0) return null;

  async function sendNow() {
    if (sending) return;
    setSending(true);
    try {
      const sent = await flushRecords(token);
      if (sent > 0) {
        toast.show(sent === 1 ? 'Registro enviado.' : `${sent} registros enviados.`, 'success');
        onSent?.();
      } else {
        toast.show('Ainda sem internet. Tentamos de novo sozinhos.', 'info');
      }
    } catch (error) {
      logBestEffort('records:send-now')(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card padding="none" elevation="sm">
      {pending.length > 0 ? (
        <View style={[styles.head, { backgroundColor: colors.warningSoft }]}>
          <Icon name="wifi-off" size="sm" color={colors.onWarningSoft} />
          <AppText variant="bodySmallStrong" style={[styles.flex, { color: colors.onWarningSoft }]}>
            {pending.length === 1
              ? '1 registro ainda não foi enviado. Quem publicou ainda não sabe.'
              : `${pending.length} registros ainda não foram enviados. Quem publicou ainda não sabe.`}
          </AppText>
        </View>
      ) : null}
      {pending.map((record) => (
        <View key={record.id} style={styles.row}>
          <Icon name="clock" size="sm" color={colors.textSecondary} />
          <AppText variant="bodySmall" style={styles.flex}>
            {pendingLine(record)}
          </AppText>
        </View>
      ))}
      {pending.length > 0 ? (
        <View style={styles.actions}>
          <Button
            title="Tentar enviar agora"
            icon="upload-cloud"
            variant="outline"
            loading={sending}
            onPress={() => void sendNow()}
          />
        </View>
      ) : null}
      {failed.map((record, index) => (
        <View key={record.id}>
          {index > 0 || pending.length > 0 ? <Divider inset /> : null}
          <View style={styles.row}>
            <Icon name="alert-triangle" size="sm" color={colors.error} />
            <View style={styles.flex}>
              <AppText variant="bodySmallStrong">Não enviado: {record.label.toLowerCase()}</AppText>
              <AppText variant="bodySmall" color="textSecondary">
                {record.reason}
              </AppText>
            </View>
            <Button
              title="Descartar"
              variant="ghost"
              onPress={() => void discardFailed(record.id).catch(logBestEffort('records:discard'))}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
