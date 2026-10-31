import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Header,
  Icon,
  IconButton,
  Notice,
  SkeletonRows,
  useToast,
  type IconName,
} from '../../src/components/ui';
import { Mascot } from '../../src/mascot';
import { loadMyPartners } from '../../src/partners/api';
import { statusLabels, type OwnPartner, type PartnerStatus } from '../../src/partners/partners';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const steps: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'edit-3',
    title: 'Cadastre sua loja',
    body: 'Nome, endereço no mapa, WhatsApp e horário. Leva dois minutos.',
  },
  {
    icon: 'gift',
    title: 'Ofereça uma vantagem',
    body: 'Um desconto ou mimo para quem adota ou resgata. É isso que paga o anúncio: aqui ninguém cobra nada.',
  },
  {
    icon: 'check-circle',
    title: 'A equipe confere',
    body: 'Depois de aprovada, sua loja aparece no mapa com a casinha dos parceiros.',
  },
];

const statusTone: Record<PartnerStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  paused: 'neutral',
};

/**
 * "Anuncie aqui": explica os Parceiros do Cupu para petshops, clínicas e lojas, e mostra a quem
 * já pediu o andamento de cada cadastro e quantas pessoas chegaram até a loja pelo app.
 */
export default function PartnersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const mine = useQuery({
    queryKey: ['partners', 'mine', token],
    queryFn: () => loadMyPartners(token),
    enabled: Boolean(token),
  });
  const partners = mine.data?.partners ?? [];

  function start() {
    if (!token) {
      router.push({ pathname: '/login', params: { returnTo: '/parceiros/novo' } });
      return;
    }
    router.push('/parceiros/novo');
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          token ? (
            <RefreshControl
              refreshing={mine.isRefetching}
              onRefresh={() => void mine.refetch()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        <View style={styles.column}>
          <Header title="Parceiros do Cupu" onBack={() => router.back()} />
          <View style={styles.body}>
            <Card elevation="md">
              <View style={styles.hero}>
                <Mascot pose="wave" size={132} />
                <AppText variant="h2" style={styles.center}>
                  Anuncie aqui, de graça
                </AppText>
                <AppText variant="body" color="textSecondary" style={styles.center}>
                  Petshop, veterinário, clínica 24h, banho e tosa ou loja de ração: apareça no mapa
                  de quem resgata e adota em Belém.
                </AppText>
              </View>
            </Card>

            <AppText variant="h3">Como funciona</AppText>
            {steps.map((step, index) => (
              <View key={step.title} style={styles.step}>
                <View style={[styles.stepIcon, { backgroundColor: colors.primarySoft }]}>
                  <Icon name={step.icon} color={colors.onPrimarySoft} />
                </View>
                <View style={styles.grow}>
                  <AppText variant="bodyStrong">{`${index + 1}. ${step.title}`}</AppText>
                  <AppText variant="bodySmall" color="textSecondary">
                    {step.body}
                  </AppText>
                </View>
              </View>
            ))}

            <Button
              title={partners.length > 0 ? 'Cadastrar outra loja' : 'Cadastrar minha loja'}
              icon="plus"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={start}
            />

            {token ? (
              mine.isLoading ? (
                <SkeletonRows />
              ) : mine.isError ? (
                <ErrorState
                  title="Não consegui abrir seus cadastros"
                  body={messageFrom(mine.error)}
                  onRetry={() => void mine.refetch()}
                />
              ) : partners.length > 0 ? (
                <>
                  <AppText variant="h3">Seus cadastros</AppText>
                  {partners.map((partner) => (
                    <OwnPartnerCard key={partner.id} partner={partner} />
                  ))}
                </>
              ) : null
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OwnPartnerCard({ partner }: { partner: OwnPartner }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [confirming, setConfirming] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ['partners'] });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      api(`/partners/${partner.id}/pause`, { method: 'POST', token, body: { paused } }),
    onSuccess: (_, paused) => {
      toast.show(
        paused ? 'Sua loja saiu do mapa por enquanto.' : 'Sua loja voltou ao mapa!',
        'success',
      );
      void refresh();
    },
    onError: (error) => toast.show(messageFrom(error), 'error'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/partners/${partner.id}`, { method: 'DELETE', token }),
    onSuccess: () => {
      setConfirming(false);
      toast.show('Cadastro excluído.', 'success');
      void refresh();
    },
    onError: (error) => toast.show(messageFrom(error), 'error'),
  });
  const label =
    partner.status === 'approved' && partner.paused
      ? 'Pausado por você'
      : statusLabels[partner.status];

  return (
    <Card>
      <View style={styles.own}>
        <View style={styles.ownHead}>
          <AppText variant="bodyStrong" style={styles.grow} numberOfLines={2}>
            {partner.name}
          </AppText>
          <Badge
            kind="label"
            label={label}
            tone={partner.paused ? 'neutral' : statusTone[partner.status]}
          />
        </View>
        <AppText variant="bodySmall" color="textSecondary">
          {partner.kindLabel} · {partner.addressText}
        </AppText>
        {partner.status === 'pending' ? (
          <Notice tone="info" message="A equipe vai conferir e você recebe um aviso aqui no app." />
        ) : null}
        {partner.reviewNote && partner.status !== 'approved' ? (
          <Notice tone="warning" message={`Recado da equipe: ${partner.reviewNote}`} />
        ) : null}
        {partner.status === 'approved' && partner.stats ? (
          <View style={[styles.stats, { backgroundColor: colors.surfaceMuted }]}>
            <Stat value={partner.stats.views} label="abriram" />
            <Stat value={partner.stats.whatsappTaps} label="no WhatsApp" />
            <Stat value={partner.stats.routeTaps} label="pediram rota" />
          </View>
        ) : null}
        {partner.status === 'approved' && partner.stats ? (
          <AppText variant="caption" color="textSecondary">
            Últimos {partner.stats.days} dias, sem saber quem foi.
          </AppText>
        ) : null}
        <View style={styles.actions}>
          <Button
            title="Editar"
            icon="edit-2"
            variant="outline"
            onPress={() => router.push({ pathname: '/parceiros/novo', params: { id: partner.id } })}
            style={styles.grow}
          />
          {partner.status === 'approved' ? (
            <Button
              title={partner.paused ? 'Voltar ao mapa' : 'Pausar'}
              icon={partner.paused ? 'play' : 'pause'}
              variant="outline"
              loading={pause.isPending}
              onPress={() => pause.mutate(!partner.paused)}
              style={styles.grow}
            />
          ) : null}
          <IconButton
            icon="trash-2"
            accessibilityLabel="Excluir cadastro"
            onPress={() => setConfirming(true)}
          />
        </View>
      </View>
      <ConfirmDialog
        visible={confirming}
        title="Excluir este cadastro?"
        message="A loja sai do mapa e os números somem. Para voltar, é preciso cadastrar de novo."
        confirmLabel="Excluir"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="h3">{value}</AppText>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

const STEP_ICON = 40;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepIcon: {
    width: STEP_ICON,
    height: STEP_ICON,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
  own: { gap: spacing.sm },
  ownHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stats: {
    flexDirection: 'row',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
