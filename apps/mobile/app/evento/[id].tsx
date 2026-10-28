import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  ErrorState,
  Header,
  Icon,
  IconButton,
  InfoChip,
  Notice,
  ProgressBar,
  SkeletonRows,
  useToast,
  type IconName,
} from '../../src/components/ui';
import { reportError } from '../../src/crash/reporter';
import {
  categoryIcons,
  categoryLabels,
  changedFields,
  historyLabels,
  needLabels,
  registrationLabel,
  shareText,
  spotsLabel,
  stateLabel,
  type EventDetail,
} from '../../src/events/agenda';
import {
  CancelSheet,
  ParticipantsSheet,
  RegisterSheet,
  ReportSheet,
  ResultSheet,
} from '../../src/events/EventSheets';
import { directionsUrl, fairWhen } from '../../src/events/fairs';
import { formatWhen } from '../../src/format';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

type Sheet = 'register' | 'participants' | 'cancel' | 'result' | 'report' | null;

/** Um evento da agenda: o que é, quando, onde, vagas, inscrição e, para quem organiza, a gestão. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Cada abertura monta a folha de novo, com o formulário limpo.
  const [sheetSession, setSheetSession] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ['event', id, token],
    queryFn: () => api<EventDetail>(`/events/${id}`, { token }),
    enabled: Boolean(id),
  });
  const event = detail.data?.event;

  function openSheet(next: Sheet) {
    setSheetSession((value) => value + 1);
    setSheet(next);
  }

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['event'] }),
      client.invalidateQueries({ queryKey: ['events'] }),
      client.invalidateQueries({ queryKey: ['adoption-events'] }),
    ]);
  }

  async function leave() {
    setLeaving(false);
    if (!event || busy) return;
    setBusy(true);
    try {
      await api(`/events/${event.id}/registrations/me`, { method: 'DELETE', token });
      await refresh();
      toast.show('Inscrição cancelada. Sua vaga foi liberada.', 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!event || busy) return;
    setBusy(true);
    try {
      await api(`/events/${event.id}/registrations/me/confirm`, { method: 'POST', token });
      await refresh();
      toast.show('Presença confirmada. Até lá!', 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setBusy(false);
    }
  }

  function openDirections() {
    if (!event) return;
    Linking.openURL(directionsUrl(event.location)).catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'event:directions' });
      toast.show('Não consegui abrir o mapa. Confira se tem um app de mapas instalado.', 'error');
    });
  }

  function share() {
    if (!event) return;
    Share.share({ message: shareText(event, fairWhen(event.startsAt, event.endsAt)) }).catch(
      (error: unknown) => {
        reportError(error, { source: 'handled', where: 'event:share' });
      },
    );
  }

  const state = event ? stateLabel(event) : null;
  const mine = event ? registrationLabel(event.registration) : null;
  const open = event ? event.state === 'scheduled' || event.state === 'happening' : false;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={detail.isRefetching}
            onRefresh={() => void detail.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header
            title="Evento"
            onBack={() => router.back()}
            right={
              event && event.reviewStatus === 'published' ? (
                <IconButton
                  icon="share-2"
                  accessibilityLabel="Compartilhar evento"
                  onPress={share}
                />
              ) : undefined
            }
          />
          {detail.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : detail.isError || !event ? (
            <ErrorState
              title="Não consegui abrir o evento"
              body={messageFrom(detail.error)}
              onRetry={() => void detail.refetch()}
            />
          ) : (
            <View style={styles.body}>
              <View style={styles.top}>
                <View style={[styles.badge, { backgroundColor: colors.caramelSoft }]}>
                  <Icon
                    name={categoryIcons[event.category] as IconName}
                    size="lg"
                    color={colors.onCaramelSoft}
                  />
                </View>
                <View style={styles.grow}>
                  <AppText variant="caption" color="textSecondary">
                    {categoryLabels[event.category].toUpperCase()}
                  </AppText>
                  <AppText variant="h2">{event.title}</AppText>
                </View>
              </View>

              {event.reviewStatus === 'pending' ? (
                <Notice
                  tone="info"
                  message="A equipe está conferindo este evento. Ele aparece na agenda depois de aprovado."
                />
              ) : null}
              {event.reviewStatus === 'rejected' ? (
                <Notice
                  tone="error"
                  message={`A equipe não aprovou este evento${event.reviewNote ? `: ${event.reviewNote}` : '.'}`}
                />
              ) : null}
              {event.state === 'cancelled' ? (
                <Notice
                  tone="warning"
                  message={`Evento cancelado${event.cancelReason ? `: ${event.cancelReason}` : '.'}`}
                />
              ) : null}

              <Card padding="md" style={styles.card}>
                <View style={styles.line}>
                  <Icon name="clock" color={colors.primary} />
                  <View style={styles.grow}>
                    <AppText variant="bodyStrong">{fairWhen(event.startsAt, event.endsAt)}</AppText>
                    <AppText variant="caption" color="textSecondary">
                      Horário de Belém
                    </AppText>
                  </View>
                </View>
                <View style={styles.line}>
                  <Icon name="map-pin" color={colors.primary} />
                  <View style={styles.grow}>
                    <AppText variant="bodyStrong">{event.placeLabel}</AppText>
                    {event.neighborhood ? (
                      <AppText variant="caption" color="textSecondary">
                        {event.neighborhood}
                      </AppText>
                    ) : null}
                  </View>
                </View>
                <Button
                  title="Como chegar"
                  icon="navigation"
                  variant="outline"
                  onPress={openDirections}
                />
                <AppText
                  variant="bodySmall"
                  color="textSecondary"
                  accessibilityRole="link"
                  onPress={() => router.push(`/user/${event.organizer.handle}`)}
                >
                  Organizado por {event.organizer.name}
                  {event.organizer.verified ? ' · perfil verificado' : ''}
                </AppText>
              </Card>

              {open && event.reviewStatus === 'published' ? (
                <Card padding="md" style={styles.card}>
                  <AppText variant="h3">Vagas</AppText>
                  {event.capacity !== null ? (
                    <ProgressBar
                      value={Math.min(1, event.registered / event.capacity)}
                      caption={`${event.registered} / ${event.capacity}`}
                      tone="secondary"
                    />
                  ) : null}
                  <AppText color="textSecondary">{spotsLabel(event)}</AppText>
                  {mine ? <InfoChip label={mine} icon="check" tone="success" /> : null}
                  {event.permissions.canRegister ? (
                    token ? (
                      <Button
                        title={
                          event.capacity !== null && (event.spotsLeft ?? 0) === 0
                            ? 'Entrar na fila de espera'
                            : 'Quero participar'
                        }
                        icon="user-plus"
                        variant="secondary"
                        fullWidth
                        onPress={() => openSheet('register')}
                      />
                    ) : (
                      <Button
                        title="Entre para se inscrever"
                        variant="secondary"
                        fullWidth
                        onPress={() => router.push('/login')}
                      />
                    )
                  ) : null}
                  {event.registration?.status === 'registered' &&
                  !event.registration.confirmedAt ? (
                    <Button
                      title="Confirmar presença"
                      icon="check-circle"
                      variant="primary"
                      fullWidth
                      loading={busy}
                      onPress={() => void confirm()}
                    />
                  ) : null}
                  {event.registration ? (
                    <Button
                      title={
                        event.registration.status === 'waitlist'
                          ? 'Sair da fila'
                          : 'Não vou poder ir'
                      }
                      variant="ghost"
                      disabled={busy}
                      onPress={() => setLeaving(true)}
                    />
                  ) : null}
                </Card>
              ) : null}

              {event.needs.length > 0 || event.needsNote ? (
                <View style={styles.section}>
                  <AppText variant="h3">Do que o evento precisa</AppText>
                  <View style={styles.wrap}>
                    {event.needs.map((need) => (
                      <InfoChip key={need} label={needLabels[need]} tone="caramel" />
                    ))}
                  </View>
                  {event.needsNote ? <AppText>{event.needsNote}</AppText> : null}
                </View>
              ) : null}

              {event.description ? (
                <View style={styles.section}>
                  <AppText variant="h3">Sobre</AppText>
                  <AppText>{event.description}</AppText>
                </View>
              ) : null}

              {event.result ? (
                <Card padding="md" style={styles.card}>
                  <AppText variant="h3">Como foi</AppText>
                  {event.result.summary ? <AppText>{event.result.summary}</AppText> : null}
                  <View style={styles.wrap}>
                    {event.result.adoptions !== null ? (
                      <InfoChip
                        label={`${event.result.adoptions} adoções`}
                        icon="heart"
                        tone="success"
                      />
                    ) : null}
                    {event.result.animalsServed !== null ? (
                      <InfoChip
                        label={`${event.result.animalsServed} animais atendidos`}
                        icon="activity"
                        tone="primary"
                      />
                    ) : null}
                    {event.result.attended > 0 ? (
                      <InfoChip
                        label={`${event.result.attended} pessoas presentes`}
                        icon="users"
                        tone="neutral"
                      />
                    ) : null}
                  </View>
                </Card>
              ) : null}

              {event.permissions.canManage ? (
                <Card padding="md" style={styles.card}>
                  <AppText variant="h3">Organização</AppText>
                  {state ? <InfoChip label={state} tone="warning" /> : null}
                  <Button
                    title={`Participantes (${event.registered}${event.waitlisted > 0 ? ` + ${event.waitlisted} na fila` : ''})`}
                    icon="users"
                    variant="outline"
                    fullWidth
                    onPress={() => openSheet('participants')}
                  />
                  {event.permissions.canEdit ? (
                    <Button
                      title="Editar evento"
                      icon="edit-3"
                      variant="outline"
                      fullWidth
                      onPress={() =>
                        router.push({ pathname: '/agenda/novo', params: { id: event.id } })
                      }
                    />
                  ) : null}
                  {event.permissions.canRecordResult ? (
                    <Button
                      title={event.result ? 'Editar resultado' : 'Contar como foi'}
                      icon="award"
                      variant="secondary"
                      fullWidth
                      onPress={() => openSheet('result')}
                    />
                  ) : null}
                  {event.permissions.canCancel ? (
                    <Button
                      title="Cancelar evento"
                      variant="ghost"
                      fullWidth
                      onPress={() => openSheet('cancel')}
                    />
                  ) : null}
                </Card>
              ) : null}

              {(detail.data?.history.length ?? 0) > 0 ? (
                <View style={styles.section}>
                  <AppText variant="h3">Histórico</AppText>
                  {detail.data?.history.map((item, index) => (
                    <View key={`${item.at}-${index}`} style={styles.history}>
                      <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                      <View style={styles.grow}>
                        <AppText variant="bodySmallStrong">{historyLabels[item.kind]}</AppText>
                        {item.kind === 'updated' && changedFields(item.fields) ? (
                          <AppText variant="bodySmall">{changedFields(item.fields)}</AppText>
                        ) : null}
                        {item.reason ? <AppText variant="bodySmall">{item.reason}</AppText> : null}
                        <AppText variant="caption" color="textSecondary">
                          {formatWhen(item.at)}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {token && !event.permissions.canManage ? (
                <>
                  <Divider />
                  <Button
                    title="Denunciar evento"
                    icon="flag"
                    variant="ghost"
                    onPress={() => openSheet('report')}
                  />
                </>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {event ? (
        <>
          <RegisterSheet
            key={`register-${sheetSession}`}
            visible={sheet === 'register'}
            event={event}
            token={token}
            onClose={() => setSheet(null)}
            onDone={async (status) => {
              setSheet(null);
              await refresh();
              toast.show(
                status === 'waitlist'
                  ? 'Você entrou na fila. Avisamos quando abrir uma vaga.'
                  : 'Inscrição feita! Você recebe lembrete antes do evento.',
                'success',
              );
            }}
          />
          <ParticipantsSheet
            key={`participants-${sheetSession}`}
            visible={sheet === 'participants'}
            event={event}
            token={token}
            onClose={() => setSheet(null)}
            onError={(message) => toast.show(message, 'error')}
          />
          <CancelSheet
            key={`cancel-${sheetSession}`}
            visible={sheet === 'cancel'}
            event={event}
            token={token}
            onClose={() => setSheet(null)}
            onDone={async () => {
              setSheet(null);
              await refresh();
              toast.show('Evento cancelado. Quem se inscreveu recebeu aviso.', 'success');
            }}
          />
          <ResultSheet
            key={`result-${sheetSession}`}
            visible={sheet === 'result'}
            event={event}
            token={token}
            onClose={() => setSheet(null)}
            onDone={async () => {
              setSheet(null);
              await refresh();
              toast.show('Resultado salvo no histórico do evento.', 'success');
            }}
          />
          <ReportSheet
            key={`report-${sheetSession}`}
            visible={sheet === 'report'}
            event={event}
            token={token}
            onClose={() => setSheet(null)}
            onDone={() => {
              setSheet(null);
              toast.show('Denúncia enviada. Obrigado por avisar.', 'success');
            }}
          />
        </>
      ) : null}

      <ConfirmDialog
        visible={leaving}
        title={event?.registration?.status === 'waitlist' ? 'Sair da fila?' : 'Cancelar inscrição?'}
        message="Sua vaga vai para a próxima pessoa da fila. Você pode se inscrever de novo se ainda tiver vaga."
        confirmLabel="Cancelar inscrição"
        cancelLabel="Voltar"
        destructive
        onCancel={() => setLeaving(false)}
        onConfirm={() => void leave()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, gap: spacing.xs },
  card: { gap: spacing.md },
  line: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  section: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  history: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
