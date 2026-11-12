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
} from '../../src/components/ui';
import { loadMyFeedPoints } from '../../src/feedPoints/api';
import { FeedPointDetails, FeedPointPin } from '../../src/feedPoints/FeedPointDetails';
import {
  feedPointStatusLabels,
  type FeedPoint,
  type FeedPointStatus,
  type OwnFeedPoint,
} from '../../src/feedPoints/feedPoints';
import { Mascot } from '../../src/mascot';
import { useSession } from '../../src/session';
import { radius, screenColumn, size, spacing, useTheme } from '../../src/theme';

const steps: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'map-pin',
    title: 'Marque o lugar',
    body: 'O pote que você abastece, ou um que você conhece no caminho do trabalho.',
  },
  {
    icon: 'camera',
    title: 'Mande uma foto',
    body: 'Do pote ou do lugar, para quem passar achar fácil. Se quiser, deixe um recado.',
  },
  {
    icon: 'check-circle',
    title: 'Todo mundo vê no mapa',
    body: 'A equipe confere e o ponto aparece. Quem passa avisa se abasteceu ou se está vazio.',
  },
];

/** Exemplo de como o cartão aparece no mapa. */
const sample: FeedPoint = {
  id: 'exemplo',
  kind: 'both',
  kindLabel: 'Ração e água',
  relation: 'mine',
  addressText: 'Praça Batista Campos, lado da Padre Eutíquio',
  note: 'Abasteço de manhã e no fim da tarde. Os gatos da praça comem aqui.',
  location: { latitude: -1.4602, longitude: -48.4897 },
  photo: null,
  lastRefilledAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  lastEmptyAt: null,
  lastCheckedAt: null,
  createdAt: new Date().toISOString(),
};

const statusTone: Record<FeedPointStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  removed: 'neutral',
};

/**
 * Pontos solidários de ração e água: explica a ideia, leva ao cadastro e mostra a quem já
 * cadastrou o andamento de cada ponto.
 */
export default function FeedPointsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const mine = useQuery({
    queryKey: ['feed-points', 'mine', token],
    queryFn: () => loadMyFeedPoints(token),
    enabled: Boolean(token),
  });
  const points = mine.data?.points ?? [];

  function start() {
    if (!token) {
      router.push({ pathname: '/login', params: { returnTo: '/pontos/novo' } });
      return;
    }
    router.push('/pontos/novo');
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
                <FeedPointPin kind="both" size={20} />
                <AppText variant="caption" style={[styles.kickerText, { color: colors.onHero }]}>
                  PONTOS SOLIDÁRIOS
                </AppText>
              </View>
            </View>
            <View style={styles.heroBody}>
              <View style={styles.heroText}>
                <AppText variant="display" style={{ color: colors.onHero }}>
                  Ração e água na rua.
                </AppText>
                <AppText variant="body" style={{ color: colors.onHeroMuted }}>
                  Você deixa um pote para os bichinhos da rua ou conhece quem deixa? Bota no mapa
                  para mais gente ajudar a manter cheio.
                </AppText>
              </View>
              <Mascot pose="bowl" size={120} />
            </View>
          </SafeAreaView>
        </HeroSurface>

        <View style={styles.column}>
          <View style={styles.body}>
            <Button
              title={points.length > 0 ? 'Cadastrar outro ponto' : 'Cadastrar um ponto'}
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
                  title="Não consegui abrir seus pontos"
                  body={messageFrom(mine.error)}
                  onRetry={() => void mine.refetch()}
                />
              ) : points.length > 0 ? (
                <>
                  <SectionTitle kicker="SEUS PONTOS" title="O que você cadastrou" />
                  {points.map((point) => (
                    <OwnPointCard key={point.id} point={point} />
                  ))}
                </>
              ) : null
            ) : null}

            <SectionTitle kicker="PRÉVIA" title="Assim o ponto aparece" />
            <View style={[styles.previewFrame, { borderColor: colors.caramelSoft }]}>
              <Card elevation="md">
                <FeedPointDetails point={sample} preview />
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

            <View style={[styles.trust, { backgroundColor: colors.primarySoft }]}>
              <Icon name="shield" color={colors.onPrimarySoft} />
              <AppText variant="bodySmall" style={[styles.grow, { color: colors.onPrimarySoft }]}>
                O mapa não mostra quem cadastrou. Se o pote fica na sua porta, marque na calçada,
                não dentro de casa.
              </AppText>
            </View>
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

function OwnPointCard({ point }: { point: OwnFeedPoint }) {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/feed-points/${point.id}`, { method: 'DELETE', token }),
    onSuccess: () => {
      setConfirming(false);
      toast.show('Ponto excluído.', 'success');
      void client.invalidateQueries({ queryKey: ['feed-points'] });
    },
    onError: (error) => toast.show(messageFrom(error), 'error'),
  });

  return (
    <Card elevation="md">
      <View style={styles.own}>
        <View style={styles.ownHead}>
          <Badge
            kind="label"
            label={feedPointStatusLabels[point.status]}
            tone={statusTone[point.status]}
          />
          <View style={styles.grow} />
          <IconButton
            icon="trash-2"
            accessibilityLabel="Excluir ponto"
            onPress={() => setConfirming(true)}
          />
        </View>
        {point.status === 'pending' ? (
          <Notice tone="info" message="A equipe vai conferir e você recebe um aviso aqui no app." />
        ) : null}
        {point.reviewNote && point.status !== 'approved' ? (
          <Notice tone="warning" message={`Recado da equipe: ${point.reviewNote}`} />
        ) : null}
        {point.status === 'approved' ? (
          <FeedPointDetails point={point} mine compact />
        ) : (
          <>
            <FeedPointDetails point={point} preview compact actions={false} />
            <Button
              title="Editar"
              icon="edit-2"
              variant="outline"
              fullWidth
              onPress={() => router.push({ pathname: '/pontos/novo', params: { id: point.id } })}
            />
          </>
        )}
      </View>
      <ConfirmDialog
        visible={confirming}
        title="Excluir este ponto?"
        message="Ele sai do mapa. Para voltar, é preciso cadastrar de novo."
        confirmLabel="Excluir"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
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
  own: { gap: spacing.md },
  ownHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
