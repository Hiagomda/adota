import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  deadlineLabel,
  entryStatusLabels,
  formatCents,
  goalProgress,
  phaseLabels,
  type CampaignDetail,
  type CampaignEntry,
} from '../../src/campaign/campaign';
import { ConfirmSheet, EditSheet, EntrySheet, ReasonSheet } from '../../src/campaign/sheets';
import {
  AppText,
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  InfoChip,
  ListItem,
  Notice,
  Photo,
  ProgressBar,
  SkeletonRows,
  Touchable,
  useToast,
} from '../../src/components/ui';
import { logBestEffort } from '../../src/crash/bestEffort';
import { formatWhen } from '../../src/format';
import { belemToday, formatDay } from '../../src/passport/passport';
import { reportSentNote } from '../../src/reportReasons';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const campaignReportReasons = [
  'Golpe ou Pix falso',
  'Comprovante falso ou editado',
  'Dinheiro usado para outra coisa',
  'Gastos sem comprovante',
  'Foto copiada ou animal que não existe',
  'Parece venda de animal',
] as const;

type Reasoning =
  | { kind: 'reject'; entry: CampaignEntry }
  | { kind: 'void'; entry: CampaignEntry }
  | { kind: 'close' };

/** A campanha inteira: meta, Pix, extrato com comprovantes e o histórico de tudo que mudou. */
export default function CampaignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [entryOpen, setEntryOpen] = useState<'owner' | 'pledge' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reasoning, setReasoning] = useState<Reasoning | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<CampaignEntry | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmWithReceipt, setConfirmWithReceipt] = useState<CampaignEntry | null>(null);
  // Cada abertura monta o formulário limpo e com uma chave nova contra envio duplo.
  const [sheetSession, setSheetSession] = useState(0);
  const campaign = useQuery({
    queryKey: ['campaign', id, token],
    queryFn: () => api<CampaignDetail>(`/campaigns/${id}`, { token }),
    enabled: Boolean(id),
  });
  const data = campaign.data;

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['campaign', id] });
    await client.invalidateQueries({ queryKey: ['campaigns'] });
  }

  function requireLogin(): boolean {
    if (token) return true;
    router.push({ pathname: '/login', params: { returnTo: `/campanha/${id}` } });
    return false;
  }

  async function confirmPledge(entry: CampaignEntry) {
    if (confirming) return;
    if (!entry.hasReceipt) {
      setSheetSession((value) => value + 1);
      setConfirmWithReceipt(entry);
      return;
    }
    setConfirming(entry.id);
    try {
      await api(`/campaigns/${id}/entries/${entry.id}/confirm`, {
        method: 'POST',
        token,
        body: {},
      });
      await refresh();
      toast.show('Doação confirmada e somada ao progresso.', 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setConfirming(null);
    }
  }

  async function submitReason(text: string): Promise<string | null> {
    if (!reasoning) return null;
    try {
      if (reasoning.kind === 'close') {
        await api(`/campaigns/${id}/close`, { method: 'POST', token, body: { note: text } });
      } else {
        await api(`/campaigns/${id}/entries/${reasoning.entry.id}/${reasoning.kind}`, {
          method: 'POST',
          token,
          body: { reason: text },
        });
      }
      setReasoning(null);
      await refresh();
      toast.show(
        reasoning.kind === 'close'
          ? 'Campanha encerrada. Quem doou recebe o aviso da prestação de contas.'
          : reasoning.kind === 'void'
            ? 'Lançamento anulado. Ele continua no extrato, riscado.'
            : 'Aviso recusado. Quem avisou recebe o motivo.',
        'success',
      );
      return null;
    } catch (error) {
      return messageFrom(error);
    }
  }

  async function report(reason: string) {
    try {
      await api('/reports', {
        method: 'POST',
        token,
        body: { targetType: 'campaign', targetId: id, reason },
      });
      setReportOpen(false);
      toast.show(reportSentNote, 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    }
  }

  function copyPix(key: string) {
    void Clipboard.setStringAsync(key)
      .then(() => toast.show('Chave Pix copiada. Cole no app do seu banco.', 'success'))
      .catch(logBestEffort('campaign:copy-pix'));
  }

  const pending = data?.entries.filter((entry) => entry.status === 'pending') ?? [];
  const ledger = data?.entries.filter((entry) => entry.status !== 'pending') ?? [];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={campaign.isRefetching}
            onRefresh={() => void campaign.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header
            title="Campanha"
            onBack={() => router.back()}
            right={
              data?.permissions.canReport ? (
                <IconButton
                  icon="flag"
                  accessibilityLabel="Denunciar irregularidade"
                  onPress={() => setReportOpen(true)}
                />
              ) : undefined
            }
          />
          {campaign.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : campaign.isError || !data ? (
            <ErrorState
              title="Não consegui abrir a campanha"
              body={messageFrom(campaign.error)}
              onRetry={() => void campaign.refetch()}
            />
          ) : (
            <View style={styles.body}>
              {data.coverUrl ? (
                <Photo
                  uri={data.coverUrl}
                  style={[styles.cover, { backgroundColor: colors.surfaceMuted }]}
                  accessibilityLabel={`Foto de ${data.animal?.name ?? 'animal da campanha'}`}
                />
              ) : null}
              <View style={styles.section}>
                <AppText variant="h1">{data.title}</AppText>
                <Touchable
                  accessibilityRole="link"
                  accessibilityLabel={`Responsável: ${data.owner.name}${data.owner.verified ? ', perfil verificado' : ''}`}
                  onPress={() => router.push(`/user/${data.owner.handle}`)}
                >
                  <View style={styles.owner}>
                    <AppText color="textSecondary">Responsável: {data.owner.name}</AppText>
                    {data.owner.verified ? (
                      <InfoChip label="Verificado" icon="check-circle" tone="success" />
                    ) : null}
                  </View>
                </Touchable>
                <View style={styles.chips}>
                  <InfoChip
                    label={phaseLabels[data.phase]}
                    icon={data.phase === 'active' ? 'clock' : 'lock'}
                    tone={data.phase === 'suspended' ? 'warning' : 'neutral'}
                  />
                  <InfoChip
                    label={
                      data.phase === 'active'
                        ? `Até ${formatDay(data.deadline)} · ${deadlineLabel(data.deadline, belemToday())}`
                        : `Prazo: ${formatDay(data.deadline)}`
                    }
                    icon="calendar"
                  />
                </View>
              </View>

              {data.phase === 'suspended' ? (
                <Notice
                  tone="warning"
                  message={`A equipe suspendeu esta campanha para conferir uma denúncia. O Pix saiu do ar até a conferência terminar.${data.suspendedReason ? ` Motivo: ${data.suspendedReason}` : ''}`}
                />
              ) : null}

              <Card elevation="md">
                <View style={styles.cardBody}>
                  <ProgressBar
                    value={goalProgress(data.totals.raisedCents, data.goalCents)}
                    label="Confirmado com comprovante"
                    caption={`${formatCents(data.totals.raisedCents)} de ${formatCents(data.goalCents)}`}
                    tone="secondary"
                  />
                  <View style={styles.stats}>
                    {[
                      { label: 'Recebido', value: formatCents(data.totals.raisedCents) },
                      { label: 'Gasto', value: formatCents(data.totals.spentCents) },
                      { label: 'Saldo', value: formatCents(data.totals.balanceCents) },
                    ].map((item) => (
                      <View key={item.label} style={styles.stat}>
                        <AppText variant="caption" color="textSecondary">
                          {item.label}
                        </AppText>
                        <AppText variant="bodyStrong">{item.value}</AppText>
                      </View>
                    ))}
                  </View>
                  <AppText variant="bodySmall" color="textSecondary">
                    {data.totals.confirmedDonations === 1
                      ? '1 doação confirmada'
                      : `${data.totals.confirmedDonations} doações confirmadas`}
                  </AppText>
                  {data.permissions.isOwner && (data.totals.pendingCount ?? 0) > 0 ? (
                    <AppText variant="bodySmall" color="textSecondary">
                      {data.totals.pendingCount} aviso(s) esperando você conferir, somando{' '}
                      {formatCents(data.totals.pendingCents ?? 0)}. Não entra no progresso até você
                      confirmar.
                    </AppText>
                  ) : null}
                </View>
              </Card>

              {data.pixKey ? (
                <Card elevation="none" style={{ backgroundColor: colors.infoSoft }}>
                  <View style={styles.cardBody}>
                    <View style={styles.pixRow}>
                      <Icon name="heart" color={colors.onInfoSoft} />
                      <AppText
                        variant="bodyStrong"
                        style={[styles.grow, { color: colors.onInfoSoft }]}
                        selectable
                      >
                        Pix: {data.pixKey}
                      </AppText>
                      <IconButton
                        icon="copy"
                        accessibilityLabel="Copiar a chave Pix"
                        onPress={() => copyPix(data.pixKey ?? '')}
                      />
                    </View>
                    <AppText variant="bodySmall" style={{ color: colors.onInfoSoft }}>
                      {data.paymentNotice}
                    </AppText>
                    {data.permissions.canPledge || !token ? (
                      <Button
                        title="Já fiz o Pix, avisar o responsável"
                        icon="send"
                        variant="secondary"
                        fullWidth
                        onPress={() => {
                          if (!requireLogin()) return;
                          setSheetSession((value) => value + 1);
                          setEntryOpen('pledge');
                        }}
                      />
                    ) : null}
                  </View>
                </Card>
              ) : null}

              {data.permissions.canAddEntries || data.permissions.canEdit ? (
                <View style={styles.actions}>
                  {data.permissions.canAddEntries ? (
                    <Button
                      title="Lançar"
                      icon="plus"
                      onPress={() => {
                        setSheetSession((value) => value + 1);
                        setEntryOpen('owner');
                      }}
                    />
                  ) : null}
                  {data.permissions.canEdit ? (
                    <Button
                      title="Editar"
                      icon="edit-3"
                      variant="outline"
                      onPress={() => {
                        setSheetSession((value) => value + 1);
                        setEditOpen(true);
                      }}
                    />
                  ) : null}
                  {data.permissions.canClose ? (
                    <Button
                      title="Encerrar"
                      icon="check-square"
                      variant="ghost"
                      onPress={() => {
                        setSheetSession((value) => value + 1);
                        setReasoning({ kind: 'close' });
                      }}
                    />
                  ) : null}
                </View>
              ) : null}

              {pending.length > 0 ? (
                <View style={styles.section}>
                  <AppText variant="h2">
                    {data.permissions.isOwner ? 'Avisos para conferir' : 'Seu aviso'}
                  </AppText>
                  {data.permissions.isOwner ? (
                    <AppText color="textSecondary">
                      Confira no extrato do banco antes de confirmar. Só confirmado soma.
                    </AppText>
                  ) : null}
                  {pending.map((entry) => (
                    <Card key={entry.id} elevation="sm">
                      <View style={styles.cardBody}>
                        <AppText variant="bodyStrong">
                          {formatCents(entry.amountCents)} · {entry.who}
                        </AppText>
                        <AppText variant="bodySmall" color="textSecondary">
                          {[
                            `Pix em ${formatDay(entry.occurredOn)}`,
                            entry.hasReceipt ? 'com comprovante' : 'sem comprovante',
                            entryStatusLabels.pending,
                          ].join(' · ')}
                        </AppText>
                        {entry.receipt ? (
                          <Button
                            title="Ver comprovante"
                            icon="image"
                            variant="ghost"
                            onPress={() => setReceiptOpen(entry)}
                          />
                        ) : null}
                        {data.permissions.isOwner && data.phase !== 'suspended' ? (
                          <View style={styles.actions}>
                            <Button
                              title="Confirmar"
                              icon="check"
                              loading={confirming === entry.id}
                              onPress={() => void confirmPledge(entry)}
                            />
                            <Button
                              title="Não achei"
                              variant="outline"
                              disabled={confirming === entry.id}
                              onPress={() => {
                                setSheetSession((value) => value + 1);
                                setReasoning({ kind: 'reject', entry });
                              }}
                            />
                          </View>
                        ) : null}
                      </View>
                    </Card>
                  ))}
                </View>
              ) : null}

              {data.closingNote ? (
                <Card elevation="sm">
                  <View style={styles.cardBody}>
                    <AppText variant="h3">Prestação de contas</AppText>
                    <AppText>{data.closingNote}</AppText>
                    {data.closedAt ? (
                      <AppText variant="bodySmall" color="textSecondary">
                        Encerrada {formatWhen(data.closedAt)}
                      </AppText>
                    ) : null}
                  </View>
                </Card>
              ) : null}

              <View style={styles.section}>
                <AppText variant="h2">Para que é o dinheiro</AppText>
                <AppText>{data.purpose}</AppText>
                {data.animal ? (
                  <Card padding="none" elevation="sm">
                    <ListItem
                      title="Passaporte do animal"
                      subtitle={data.animal.name ?? 'Saúde, lares e ocorrências dele'}
                      icon="book-open"
                      showChevron
                      onPress={() => router.push(`/animal/${data.animal?.id ?? ''}`)}
                    />
                    {data.post ? (
                      <>
                        <Divider inset />
                        <ListItem
                          title="Ver o caso"
                          subtitle={data.post.approxLabel}
                          icon="map-pin"
                          showChevron
                          onPress={() => router.push(`/post/${data.post?.id ?? ''}`)}
                        />
                      </>
                    ) : null}
                  </Card>
                ) : null}
              </View>

              <View style={styles.section}>
                <AppText variant="h2">Extrato</AppText>
                {ledger.length === 0 ? (
                  <EmptyState
                    compact
                    pose="bowl"
                    title="Nada lançado ainda"
                    body="Doações confirmadas e despesas com comprovante aparecem aqui."
                  />
                ) : (
                  <Card padding="none" elevation="md">
                    {ledger.map((entry, index) => {
                      const struck = entry.status === 'voided' || entry.status === 'rejected';
                      return (
                        <View key={entry.id}>
                          {index > 0 ? <Divider inset /> : null}
                          <View style={styles.entry}>
                            <View
                              style={[
                                styles.entryIcon,
                                {
                                  backgroundColor:
                                    entry.kind === 'expense'
                                      ? colors.warningSoft
                                      : colors.successSoft,
                                },
                              ]}
                            >
                              <Icon
                                name={
                                  entry.kind === 'expense' ? 'arrow-up-right' : 'arrow-down-left'
                                }
                                size="sm"
                                color={
                                  entry.kind === 'expense' ? colors.onWarningSoft : colors.primary
                                }
                              />
                            </View>
                            <View style={styles.grow}>
                              <AppText
                                variant="bodyStrong"
                                style={struck ? styles.struck : undefined}
                              >
                                {entry.kind === 'expense' ? '− ' : '+ '}
                                {formatCents(entry.amountCents)}
                              </AppText>
                              <AppText variant="bodySmall">{entry.description}</AppText>
                              <AppText variant="bodySmall" color="textSecondary">
                                {[
                                  formatDay(entry.occurredOn),
                                  entry.who,
                                  entryStatusLabels[entry.status],
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </AppText>
                              {entry.decisionNote ? (
                                <AppText variant="bodySmall" color="textSecondary">
                                  Motivo: {entry.decisionNote}
                                </AppText>
                              ) : null}
                            </View>
                            <View style={styles.entryActions}>
                              {entry.receipt ? (
                                <IconButton
                                  icon="file-text"
                                  accessibilityLabel={`Ver comprovante de ${formatCents(entry.amountCents)}`}
                                  onPress={() => setReceiptOpen(entry)}
                                />
                              ) : null}
                              {entry.status === 'confirmed' &&
                              data.permissions.isOwner &&
                              data.phase !== 'suspended' ? (
                                <IconButton
                                  icon="slash"
                                  accessibilityLabel={`Anular lançamento de ${formatCents(entry.amountCents)}`}
                                  onPress={() => {
                                    setSheetSession((value) => value + 1);
                                    setReasoning({ kind: 'void', entry });
                                  }}
                                />
                              ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </Card>
                )}
                <AppText variant="caption" color="textSecondary">
                  Comprovantes de despesa são públicos. Os de doação ficam com o responsável, a
                  equipe e quem doou, porque mostram dados do banco de quem doou.
                </AppText>
              </View>

              <View style={styles.section}>
                <AppText variant="h2">Histórico</AppText>
                <AppText color="textSecondary">
                  Tudo que mudou na campanha, com data e motivo. Nada aqui pode ser apagado.
                </AppText>
                {data.history.map((item) => (
                  <View key={item.id} style={styles.event}>
                    <View style={[styles.dot, { backgroundColor: colors.surfaceMuted }]}>
                      <Icon name="clock" size="sm" color={colors.primary} />
                    </View>
                    <View style={styles.grow}>
                      <AppText variant="bodyStrong">{item.summary}</AppText>
                      <AppText variant="bodySmall" color="textSecondary">
                        {`${item.actor} · ${formatWhen(item.createdAt)}`}
                      </AppText>
                      {item.note ? <AppText variant="bodySmall">“{item.note}”</AppText> : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {data ? (
        <>
          <EntrySheet
            key={`entry-${sheetSession}`}
            visible={entryOpen !== null}
            mode={entryOpen ?? 'owner'}
            campaignId={data.id}
            token={token}
            onClose={() => setEntryOpen(null)}
            onSaved={async (message) => {
              setEntryOpen(null);
              await refresh();
              toast.show(message, 'success');
            }}
          />
          {confirmWithReceipt ? (
            <ConfirmSheet
              key={`confirm-${sheetSession}`}
              visible
              campaignId={data.id}
              entryId={confirmWithReceipt.id}
              amountLabel={formatCents(confirmWithReceipt.amountCents)}
              token={token}
              onClose={() => setConfirmWithReceipt(null)}
              onSaved={async () => {
                setConfirmWithReceipt(null);
                await refresh();
                toast.show('Doação confirmada e somada ao progresso.', 'success');
              }}
            />
          ) : null}
          <EditSheet
            key={`edit-${sheetSession}`}
            visible={editOpen}
            campaign={data}
            token={token}
            onClose={() => setEditOpen(false)}
            onSaved={async () => {
              setEditOpen(false);
              await refresh();
              toast.show('Campanha atualizada. A mudança ficou no histórico.', 'success');
            }}
          />
          <ReasonSheet
            key={`reason-${sheetSession}`}
            visible={reasoning !== null}
            title={
              reasoning?.kind === 'close'
                ? 'Encerrar com prestação de contas'
                : reasoning?.kind === 'void'
                  ? 'Anular lançamento'
                  : 'Não achei no extrato'
            }
            label={reasoning?.kind === 'close' ? 'Como o dinheiro foi usado' : 'Motivo'}
            placeholder={
              reasoning?.kind === 'close'
                ? 'Ex.: cirurgia feita, a Mel está em casa; o saldo de R$ 80 foi para ração.'
                : reasoning?.kind === 'void'
                  ? 'Ex.: valor lançado em dobro por engano'
                  : 'Ex.: não apareceu Pix desse valor no dia'
            }
            minLength={reasoning?.kind === 'close' ? 20 : reasoning?.kind === 'void' ? 10 : 3}
            confirmLabel={
              reasoning?.kind === 'close'
                ? 'Encerrar campanha'
                : reasoning?.kind === 'void'
                  ? 'Anular'
                  : 'Recusar aviso'
            }
            helper={
              reasoning?.kind === 'close'
                ? 'Fica público na campanha e quem doou recebe um aviso. Responda os avisos pendentes antes.'
                : 'Fica no histórico da campanha.'
            }
            destructive={reasoning?.kind !== 'close'}
            onClose={() => setReasoning(null)}
            onConfirm={submitReason}
          />
        </>
      ) : null}

      <BottomSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="O que está irregular?"
      >
        {campaignReportReasons.map((reason) => (
          <ListItem
            key={reason}
            title={reason}
            icon="flag"
            showChevron
            onPress={() => {
              if (!requireLogin()) return;
              void report(reason);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet
        visible={receiptOpen !== null}
        onClose={() => setReceiptOpen(null)}
        title="Comprovante"
      >
        {receiptOpen?.receipt ? (
          <View style={styles.receipt}>
            <Photo
              uri={receiptOpen.receipt.url}
              style={[styles.receiptImage, { backgroundColor: colors.surfaceMuted }]}
              contentFit="contain"
              accessibilityLabel={`Comprovante de ${formatCents(receiptOpen.amountCents)}`}
            />
            <Button
              title="Abrir em tela cheia"
              icon="external-link"
              variant="ghost"
              onPress={() =>
                void Linking.openURL(receiptOpen.receipt?.url ?? '').catch(
                  logBestEffort('campaign:open-receipt'),
                )
              }
            />
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl },
  section: { gap: spacing.sm },
  owner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardBody: { gap: spacing.sm, padding: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  stat: { flexGrow: 1, minWidth: 88, gap: 2 },
  pixRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  entry: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
  entryIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryActions: { flexDirection: 'row' },
  struck: { textDecorationLine: 'line-through' },
  event: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receipt: { gap: spacing.md, paddingBottom: spacing.xl },
  receiptImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
