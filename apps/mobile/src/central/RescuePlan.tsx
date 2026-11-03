import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import { AppText, Button, Card, Chip, Divider, Icon, InfoChip, useToast } from '../components/ui';
import { spacing, useTheme } from '../theme';
import {
  needLabel,
  needStateLabel,
  openNeedCount,
  rescueNeedKinds,
  type HelpOfferKind,
  type RescueNeed,
  type RescueNeedMark,
  type RescuePlanPage,
} from './central';

const stateTone = {
  open: 'warning',
  offered: 'info',
  covered: 'success',
  dismissed: 'neutral',
} as const;

/**
 * Plano de ação do resgate: o que o caso precisa e o que já tem quem resolva. Quem pode ajudar
 * vê na hora o que falta; quem publicou marca resolvido, "não precisa" ou inclui o que faltou.
 */
export function RescuePlan({
  postId,
  token,
  plan,
  canOffer,
  offeredKinds,
  onOffer,
}: {
  postId: string;
  token: string | null;
  plan: UseQueryResult<RescuePlanPage>;
  canOffer: boolean;
  /** O que a própria pessoa já ofereceu nesse resgate. */
  offeredKinds: readonly HelpOfferKind[];
  onOffer: (kind: HelpOfferKind) => void;
}) {
  const { colors } = useTheme();
  const client = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const page = plan.data;
  if (!page || !page.applies || page.needs.length === 0) return null;
  const missing = openNeedCount(page.needs);
  const listed = new Set(page.needs.map((need) => need.kind));
  const addable = page.canManage
    ? rescueNeedKinds.filter((item) => !listed.has(item.value) && item.value !== 'check_site')
    : [];

  async function setMark(need: RescueNeed['kind'], mark: RescueNeedMark) {
    if (busy) return;
    setBusy(`${need}:${mark}`);
    try {
      const next = await api<RescuePlanPage>(`/posts/${postId}/plan/${need}`, {
        method: 'PUT',
        token,
        body: { mark },
      });
      client.setQueryData(['rescue-plan', postId, token], next);
      await client.invalidateQueries({ queryKey: ['central'] });
    } catch (failure) {
      toast.show(messageFrom(failure), 'error');
      void plan.refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.title}>
        <AppText variant="h2">Plano de ação</AppText>
        <InfoChip
          label={
            missing === 0 ? 'Tudo encaminhado' : missing === 1 ? 'Falta 1' : `Faltam ${missing}`
          }
          tone={missing === 0 ? 'success' : 'warning'}
        />
      </View>
      <AppText color="textSecondary">
        O que esse resgate precisa. Ofereça o que está em falta para a ajuda não se repetir.
      </AppText>
      <Card padding="none" elevation="sm">
        {page.needs.map((need, index) => {
          const kind = rescueNeedKinds.find((item) => item.value === need.kind);
          const offerKind = need.kind === 'check_site' ? null : (need.kind as HelpOfferKind);
          const canGive =
            canOffer &&
            offerKind !== null &&
            need.state === 'open' &&
            !offeredKinds.includes(offerKind);
          return (
            <View key={need.kind}>
              {index > 0 ? <Divider inset /> : null}
              <View style={styles.row}>
                <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
                  <Icon name={kind?.icon ?? 'heart'} size="sm" color={colors.textSecondary} />
                </View>
                <View style={styles.rowText}>
                  <View style={styles.rowTitle}>
                    <AppText variant="bodySmallStrong">{needLabel(need.kind)}</AppText>
                    <InfoChip label={needStateLabel[need.state]} tone={stateTone[need.state]} />
                  </View>
                  <AppText variant="bodySmall" color="textSecondary">
                    {need.kind === 'check_site' && need.state === 'open' && !page.canManage
                      ? 'Ninguém a caminho ainda. Toque em "Eu vou ajudar" se puder ir.'
                      : need.state === 'offered' && page.canManage && need.kind !== 'foster'
                        ? `${need.detail}. Responda em "Outras ajudas".`
                        : need.detail}
                  </AppText>
                  {canGive && offerKind ? (
                    <View style={styles.actions}>
                      <Button
                        title="Posso ajudar com isso"
                        icon="heart"
                        variant="outline"
                        onPress={() => onOffer(offerKind)}
                      />
                    </View>
                  ) : null}
                  {page.canManage ? (
                    <View style={styles.actions}>
                      {need.state === 'open' || need.state === 'offered' ? (
                        <>
                          <Chip
                            label="Resolvido"
                            icon="check"
                            disabled={busy !== null}
                            onPress={() => void setMark(need.kind, 'covered')}
                          />
                          <Chip
                            label="Não precisa"
                            icon="x"
                            disabled={busy !== null}
                            onPress={() => void setMark(need.kind, 'dismissed')}
                          />
                        </>
                      ) : null}
                      {need.marked ? (
                        <Chip
                          label="Desfazer"
                          icon="rotate-ccw"
                          disabled={busy !== null}
                          onPress={() => void setMark(need.kind, 'auto')}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </Card>
      {addable.length > 0 ? (
        <View style={styles.actions}>
          {addable.map((item) => (
            <Chip
              key={item.value}
              label={`Precisa de ${item.label.toLowerCase()}`}
              icon="plus"
              disabled={busy !== null}
              onPress={() => void setMark(item.value, 'needed')}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  title: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
