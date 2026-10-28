import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { speciesLabel } from '../animalLabels';
import { AppText, Badge, Button, Card, ConfirmDialog, Photo } from '../components/ui';
import { formatWhen } from '../format';
import { radius, spacing, useTheme } from '../theme';
import {
  actionLabels,
  stayActions,
  stayStatusLabels,
  stayStatusTone,
  type FosterStay,
  type StayAction,
} from './fosterHome';

const confirmText: Partial<Record<StayAction, { title: string; message: string }>> = {
  decline: {
    title: 'Recusar este pedido?',
    message: 'Quem pediu recebe um aviso para procurar outra Casa Amiga.',
  },
  cancel: {
    title: 'Cancelar o acolhimento?',
    message:
      'A outra pessoa recebe um aviso. Se o animal já está com você, combinem a volta antes.',
  },
  end: {
    title: 'Encerrar o acolhimento?',
    message: 'Use quando o animal saiu da casa. A vaga volta a ficar livre e os dias entram no XP.',
  },
};

/** Um pedido de acolhimento, do lado de quem acolhe ou de quem pediu. */
export function StayCard({
  stay,
  side,
  busy,
  contactBusy,
  onAction,
  onOpenPost,
  onTalk,
}: {
  stay: FosterStay;
  side: 'foster' | 'requester';
  busy: string | null;
  contactBusy: boolean;
  onAction: (action: StayAction) => void;
  onOpenPost: () => void;
  onTalk: () => void;
}) {
  const { colors } = useTheme();
  const [confirming, setConfirming] = useState<StayAction | null>(null);
  const actions = stayActions(stay.status, side);
  const animal = stay.animal.name ?? speciesLabel[stay.animal.species] ?? 'Animal';
  const who = side === 'foster' ? stay.requester?.name : stay.foster.name;
  const confirm = confirming ? confirmText[confirming] : undefined;

  return (
    <Card elevation="sm">
      <View style={styles.body}>
        <View style={styles.top}>
          <Photo
            uri={stay.animal.photoUrl}
            style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
            accessibilityLabel={`Foto de ${animal}`}
          />
          <View style={styles.text}>
            <AppText variant="bodyStrong">{animal}</AppText>
            <AppText variant="bodySmall" color="textSecondary">
              {stay.post.approxLabel} · {formatWhen(stay.createdAt)}
            </AppText>
            {who ? (
              <AppText variant="bodySmall" color="textSecondary">
                {side === 'foster' ? `Pedido de ${who}` : `Casa de ${who}`}
              </AppText>
            ) : null}
            <View style={styles.badges}>
              <Badge
                kind="label"
                label={stayStatusLabels[stay.status]}
                tone={stayStatusTone[stay.status]}
              />
              {stay.specialCare ? (
                <Badge kind="label" label="Cuidados especiais" tone="warning" />
              ) : null}
            </View>
          </View>
        </View>
        <AppText>“{stay.message}”</AppText>
        {stay.expectedDays ? (
          <AppText variant="bodySmall" color="textSecondary">
            Por cerca de {stay.expectedDays} dias
          </AppText>
        ) : null}
        {stay.responseNote ? (
          <AppText variant="bodySmall" color="textSecondary">
            Resposta: {stay.responseNote}
          </AppText>
        ) : null}
        <View style={styles.actions}>
          {actions.map((action) => (
            <Button
              key={action}
              title={actionLabels[action]}
              variant={action === 'approve' ? 'primary' : action === 'end' ? 'secondary' : 'ghost'}
              loading={busy === `${stay.id}:${action}`}
              disabled={busy !== null && busy !== `${stay.id}:${action}`}
              onPress={() => (confirmText[action] ? setConfirming(action) : onAction(action))}
            />
          ))}
          {stay.status === 'approved' ? (
            <Button
              title="WhatsApp"
              icon="message-circle"
              variant="outline"
              loading={contactBusy}
              onPress={onTalk}
            />
          ) : null}
          <Button title="Ver post" variant="ghost" onPress={onOpenPost} />
        </View>
      </View>
      <ConfirmDialog
        visible={confirming !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirming ? actionLabels[confirming] : ''}
        cancelLabel="Voltar"
        destructive={confirming !== 'end'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const action = confirming;
          setConfirming(null);
          if (action) onAction(action);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  top: { flexDirection: 'row', gap: spacing.md },
  photo: { width: 64, height: 64, borderRadius: radius.lg },
  text: { flex: 1, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
