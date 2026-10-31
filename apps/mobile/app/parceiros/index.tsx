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
  HeroSurface,
  Icon,
  IconButton,
  Notice,
  PetPattern,
  SkeletonRows,
  useToast,
  type IconName,
  type Tone,
} from '../../src/components/ui';
import { toneColors } from '../../src/components/ui/tones';
import { Mascot } from '../../src/mascot';
import { loadMyPartners } from '../../src/partners/api';
import { PartnerBanner, PartnerPin, PerkTicket } from '../../src/partners/PartnerArt';
import { PartnerDetails } from '../../src/partners/PartnerDetails';
import {
  statusLabels,
  type OwnPartner,
  type Partner,
  type PartnerStatus,
} from '../../src/partners/partners';
import { useSession } from '../../src/session';
import { radius, screenColumn, size, spacing, useTheme } from '../../src/theme';

const steps: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'edit-3',
    title: 'Cadastre sua loja',
    body: 'Nome, ponto no mapa, WhatsApp e horário. Leva dois minutos.',
  },
  {
    icon: 'gift',
    title: 'Ofereça uma vantagem',
    body: 'Um desconto ou mimo para quem adota ou resgata. É isso que paga o anúncio.',
  },
  {
    icon: 'check-circle',
    title: 'A equipe confere',
    body: 'Aprovou, a casinha da sua loja aparece no mapa e você recebe um aviso.',
  },
];

const highlights: { icon: IconName; label: string }[] = [
  { icon: 'map-pin', label: 'No mapa' },
  { icon: 'message-circle', label: 'Direto no WhatsApp' },
  { icon: 'heart', label: 'R$ 0 por mês' },
];

/** Exemplo de como o cartão aparece no mapa. */
const sample: Partner = {
  id: 'exemplo',
  name: 'Petshop da Dona Bené',
  kind: 'petshop',
  kindLabel: 'Petshop',
  about: null,
  perk: '10% de desconto em ração para quem adotar pelo app',
  hours: 'Seg a sáb, 8h às 19h',
  addressText: 'Tv. Padre Eutíquio, 1200 · Batista Campos',
  location: { latitude: -1.4602, longitude: -48.4931 },
  whatsapp: '5591988887777',
  instagram: null,
  featured: false,
};

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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
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
        <HeroSurface style={styles.hero}>
          <PetPattern color={colors.onHero} opacity={0.1} />
          <SafeAreaView edges={['top']} style={styles.heroInner}>
            <View style={styles.heroTop}>
              <IconButton
                icon="arrow-left"
                variant="hero"
                accessibilityLabel="Voltar"
                onPress={() => router.back()}
              />
              <View style={[styles.kicker, { backgroundColor: colors.heroGlass }]}>
                <PartnerPin size={20} />
                <AppText variant="caption" style={[styles.kickerText, { color: colors.onHero }]}>
                  PARCEIROS DO CUPU
                </AppText>
              </View>
            </View>
            <View style={styles.heroBody}>
              <View style={styles.heroText}>
                <AppText variant="display" style={{ color: colors.onHero }}>
                  Anuncie aqui.
                </AppText>
                <AppText variant="h2" style={{ color: colors.heroAccent }}>
                  De graça, égua!
                </AppText>
                <AppText variant="body" style={{ color: colors.onHeroMuted }}>
                  Petshop, veterinário, clínica 24h, banho e tosa ou ração: apareça no mapa de quem
                  resgata e adota em Belém.
                </AppText>
              </View>
              <Mascot pose="wave" size={120} />
            </View>
            <View style={styles.highlights}>
              {highlights.map((item) => (
                <View
                  key={item.label}
                  style={[styles.highlight, { backgroundColor: colors.heroGlass }]}
                >
                  <Icon name={item.icon} size="sm" color={colors.heroAccent} />
                  <AppText variant="caption" style={{ color: colors.onHero }}>
                    {item.label}
                  </AppText>
                </View>
              ))}
            </View>
          </SafeAreaView>
        </HeroSurface>

        <View style={styles.column}>
          <View style={styles.body}>
            <SectionTitle kicker="PRÉVIA" title="Assim sua loja aparece" />
            <View style={[styles.previewFrame, { borderColor: colors.primarySoft }]}>
              <Card elevation="md">
                <PartnerDetails partner={sample} preview />
              </Card>
            </View>

            <SectionTitle kicker="PASSO A PASSO" title="Como funciona" />
            <View>
              {steps.map((step, index) => (
                <View key={step.title} style={styles.step}>
                  <View style={styles.stepRail}>
                    <View style={[styles.stepDot, { backgroundColor: colors.secondary }]}>
                      <AppText variant="bodyStrong" style={{ color: colors.onSecondary }}>
                        {index + 1}
                      </AppText>
                    </View>
                    {index < steps.length - 1 ? (
                      <View style={[styles.stepLine, { backgroundColor: colors.border }]} />
                    ) : null}
                  </View>
                  <View style={styles.stepText}>
                    <View style={styles.stepHead}>
                      <Icon name={step.icon} size="sm" color={colors.primary} />
                      <AppText variant="bodyStrong">{step.title}</AppText>
                    </View>
                    <AppText variant="bodySmall" color="textSecondary">
                      {step.body}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>

            <Button
              title={partners.length > 0 ? 'Cadastrar outra loja' : 'Cadastrar minha loja'}
              icon="plus"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={start}
            />
            <View style={[styles.trust, { backgroundColor: colors.primarySoft }]}>
              <Icon name="shield" color={colors.onPrimarySoft} />
              <AppText variant="bodySmall" style={[styles.grow, { color: colors.onPrimarySoft }]}>
                O Égua, adota! não cobra nem recebe dinheiro dos parceiros. Venda de animais não é
                permitida.
              </AppText>
            </View>

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
                  <SectionTitle kicker="SUA LOJA" title="Seus cadastros" />
                  {partners.map((partner) => (
                    <OwnPartnerCard key={partner.id} partner={partner} />
                  ))}
                </>
              ) : null
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <AppText variant="caption" color="onSecondarySoft" style={styles.kickerText}>
        {kicker}
      </AppText>
      <AppText variant="h2">{title}</AppText>
    </View>
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

  const live = partner.status === 'approved' && !partner.paused;

  return (
    <Card padding="none" elevation="md">
      <PartnerBanner rounded={0} style={styles.ownBanner}>
        <View style={styles.ownBannerRow}>
          <PartnerPin size={40} />
          <View style={styles.grow}>
            <AppText variant="h3" numberOfLines={2} style={{ color: colors.onHero }}>
              {partner.name}
            </AppText>
            <AppText variant="caption" numberOfLines={1} style={{ color: colors.onHeroMuted }}>
              {partner.kindLabel} · {partner.addressText}
            </AppText>
          </View>
          <Badge
            kind="label"
            label={label}
            tone={partner.paused ? 'neutral' : statusTone[partner.status]}
          />
        </View>
      </PartnerBanner>
      <View style={styles.own}>
        {partner.status === 'pending' ? (
          <Notice tone="info" message="A equipe vai conferir e você recebe um aviso aqui no app." />
        ) : null}
        {partner.reviewNote && partner.status !== 'approved' ? (
          <Notice tone="warning" message={`Recado da equipe: ${partner.reviewNote}`} />
        ) : null}
        {partner.status === 'approved' && partner.stats ? (
          <>
            <View style={styles.stats}>
              <Stat icon="eye" value={partner.stats.views} label="abriram" tone="primary" />
              <Stat
                icon="message-circle"
                value={partner.stats.whatsappTaps}
                label="no WhatsApp"
                tone="success"
              />
              <Stat
                icon="navigation"
                value={partner.stats.routeTaps}
                label="pediram rota"
                tone="caramel"
              />
            </View>
            <AppText variant="caption" color="textSecondary">
              {live
                ? `Últimos ${partner.stats.days} dias. Só números, sem saber quem foi.`
                : 'Sua loja está fora do mapa agora. Os números voltam a subir quando ela voltar.'}
            </AppText>
          </>
        ) : null}
        <PerkTicket perk={partner.perk} compact />
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

function Stat({
  icon,
  value,
  label,
  tone,
}: {
  icon: IconName;
  value: number;
  label: string;
  tone: Tone;
}) {
  const { colors } = useTheme();
  const palette = toneColors(colors, tone);
  return (
    <View style={[styles.stat, { backgroundColor: palette.background }]}>
      <Icon name={icon} size="sm" color={palette.foreground} />
      <AppText variant="h2" style={{ color: palette.foreground }}>
        {value}
      </AppText>
      <AppText variant="caption" style={{ color: palette.foreground }}>
        {label}
      </AppText>
    </View>
  );
}

const STEP_DOT = 32;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  hero: { paddingBottom: size.curve + spacing.lg },
  heroInner: { ...screenColumn, paddingHorizontal: spacing.lg, gap: spacing.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  kickerText: { letterSpacing: 1.2, fontWeight: '700' },
  heroBody: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  heroText: { flex: 1, gap: spacing.xs },
  highlights: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingTop: spacing.md },
  sectionTitle: { gap: spacing.xs },
  previewFrame: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.xl + 6, padding: 4 },
  step: { flexDirection: 'row', gap: spacing.md },
  stepRail: { alignItems: 'center', width: STEP_DOT },
  stepDot: {
    width: STEP_DOT,
    height: STEP_DOT,
    borderRadius: STEP_DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { width: 2, flex: 1, marginVertical: spacing.xs },
  stepText: { flex: 1, gap: spacing.xs, paddingBottom: spacing.lg },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  trust: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  grow: { flex: 1 },
  ownBanner: { padding: spacing.lg },
  ownBannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  own: { gap: spacing.md, padding: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
