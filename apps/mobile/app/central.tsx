import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, isNetworkError, messageFrom } from '../src/api';
import { placeOf, sizeLabel, speciesLabel } from '../src/animalLabels';
import {
  activeFilterCount,
  belemClock,
  caseDistance,
  centralPath,
  defaultCentralFilters,
  distanceFilters,
  freshCaseIds,
  helpSummary,
  speciesFilters,
  statusFilters,
  type CentralCase,
  type CentralFilters,
  type CentralPage,
} from '../src/central/central';
import { OfferSheet } from '../src/central/OfferSheet';
import {
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  Notice,
  Photo,
  SkeletonRows,
  StatCard,
  StatusPill,
  useToast,
} from '../src/components/ui';
import { formatWhen } from '../src/format';
import { requestMapFocus } from '../src/map/focusRequest';
import { useViewerLocation } from '../src/place/deviceLocation';
import { useSession } from '../src/session';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';

/**
 * Central de resgates: o que está acontecendo agora na cidade, do caso mais urgente para o
 * menos, com quem já está ajudando e o que ainda falta. Atualiza sozinha enquanto está aberta.
 */
export default function CentralScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const focused = useIsFocused();
  const fix = useViewerLocation();
  // Arredondado para a busca não mudar a cada passo do GPS.
  const here = useMemo(
    () =>
      fix
        ? {
            latitude: Math.round(fix.latitude * 200) / 200,
            longitude: Math.round(fix.longitude * 200) / 200,
          }
        : null,
    [fix],
  );
  const [filters, setFilters] = useState<CentralFilters>(defaultCentralFilters);
  const [offerFor, setOfferFor] = useState<CentralCase | null>(null);
  // Só o puxar da pessoa mostra o carregando; a atualização automática é silenciosa.
  const [pulling, setPulling] = useState(false);
  const path = centralPath(filters, here);
  const queryKey = ['central', path, token];
  const central = useQuery({
    queryKey,
    // Novidade é o que mudou desde a lista anterior com os mesmos filtros, que ainda está no cache.
    queryFn: async (): Promise<CentralPage & { fresh: string[] }> => {
      const previous = client.getQueryData<CentralPage>(queryKey);
      const next = await api<CentralPage>(path, { token });
      const since = previous
        ? { serverTime: previous.serverTime, ids: previous.cases.map((item) => item.id) }
        : null;
      return { ...next, fresh: [...freshCaseIds(since, next.cases)] };
    },
    // Tempo real sem conexão aberta: pergunta de novo no intervalo que o servidor pede, só
    // enquanto a tela está na frente. Com a internet fora, a última lista continua na tela.
    refetchInterval: (query) => (focused ? (query.state.data?.refreshSeconds ?? 20) * 1000 : false),
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
  const page = central.data;
  const fresh = new Set(page?.fresh ?? []);

  const filterCount = activeFilterCount(filters, here !== null);
  const set = (patch: Partial<CentralFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  const offline = central.isError && isNetworkError(central.error) && page;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => {
              setPulling(true);
              void central.refetch().finally(() => setPulling(false));
            }}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header
            title="Central de resgates"
            subtitle={
              page ? `Atualizada às ${belemClock(page.serverTime)} · atualiza sozinha` : undefined
            }
            large
            onBack={() => router.back()}
          />

          {page ? (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <StatCard
                  value={page.summary.activeCases}
                  label="Casos ativos"
                  icon="alert-circle"
                  tone="primary"
                />
              </View>
              <View style={styles.stat}>
                <StatCard
                  value={page.summary.withoutHelp}
                  label="Sem ajuda"
                  icon="user-x"
                  tone="secondary"
                />
              </View>
              <View style={styles.stat}>
                <StatCard
                  value={page.summary.volunteers}
                  label="Voluntários"
                  icon="users"
                  tone="caramel"
                />
              </View>
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip
              label="Sem ajuda"
              icon="user-x"
              selected={filters.withoutHelp}
              onPress={() => set({ withoutHelp: !filters.withoutHelp })}
            />
            {statusFilters.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.status === option.value}
                onPress={() => set({ status: option.value })}
              />
            ))}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {speciesFilters.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.species === option.value}
                onPress={() => set({ species: option.value })}
              />
            ))}
            {here
              ? distanceFilters.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    icon={option.value > 0 ? 'map-pin' : undefined}
                    selected={filters.radiusKm === option.value}
                    onPress={() => set({ radiusKm: option.value })}
                  />
                ))
              : null}
          </ScrollView>
          {!here ? (
            <View style={styles.notice}>
              <Notice
                tone="info"
                message="Sem a sua localização, a central mostra a cidade toda e não filtra por distância."
              />
            </View>
          ) : null}
          {offline ? (
            <View style={styles.notice}>
              <Notice
                tone="warning"
                message={`Sem conexão. Mostrando a lista das ${belemClock(page.serverTime)}.`}
                action={{ label: 'Tentar de novo', onPress: () => void central.refetch() }}
              />
            </View>
          ) : null}

          {central.isLoading ? (
            <View style={styles.list}>
              <SkeletonRows />
            </View>
          ) : !page ? (
            <ErrorState
              title="Não consegui abrir a central"
              body={messageFrom(central.error)}
              onRetry={() => void central.refetch()}
            />
          ) : page.cases.length === 0 ? (
            filterCount > 0 ? (
              <EmptyState
                pose="search"
                title="Nenhum caso com esses filtros"
                body="Tente outra distância ou outro status."
                actionLabel="Limpar filtros"
                onAction={() => setFilters(defaultCentralFilters)}
              />
            ) : (
              <EmptyState
                pose="party"
                title="Nenhum resgate em andamento"
                body="Quando alguém pedir socorro para um animal, o caso aparece aqui na hora."
              />
            )
          ) : (
            <View style={styles.list} accessibilityRole="list">
              {page.cases.map((item) => (
                <CaseCard
                  key={item.id}
                  item={item}
                  fresh={fresh.has(item.id)}
                  canOffer={Boolean(token) && !item.viewer.isAuthor}
                  onOpen={() => router.push(`/post/${item.id}`)}
                  onOffer={() => setOfferFor(item)}
                  onMap={() => {
                    requestMapFocus({
                      postId: item.id,
                      latitude: item.location.latitude,
                      longitude: item.location.longitude,
                    });
                    router.navigate('/explore');
                  }}
                />
              ))}
            </View>
          )}
          {!token && page && page.cases.length > 0 ? (
            <View style={styles.notice}>
              <Notice
                tone="info"
                message="Entre na sua conta para oferecer lar temporário, ração, veterinário ou materiais."
                action={{ label: 'Entrar', onPress: () => router.push('/login') }}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <OfferSheet
        visible={offerFor !== null}
        postId={offerFor?.id ?? null}
        token={token}
        already={offerFor?.viewer.offers ?? []}
        onClose={() => setOfferFor(null)}
        onSent={async () => {
          setOfferFor(null);
          toast.show('Oferta enviada. Quem cuida do resgate vai responder.', 'success');
          await client.invalidateQueries({ queryKey: ['central'] });
        }}
      />
    </SafeAreaView>
  );
}

function CaseCard({
  item,
  fresh,
  canOffer,
  onOpen,
  onOffer,
  onMap,
}: {
  item: CentralCase;
  fresh: boolean;
  canOffer: boolean;
  onOpen: () => void;
  onOffer: () => void;
  onMap: () => void;
}) {
  const { colors } = useTheme();
  const title = item.animal.name ?? speciesLabel[item.animal.species] ?? 'Bichinho';
  const facts = [sizeLabel[item.animal.size], caseDistance(item.distanceKm)]
    .filter(Boolean)
    .join(' · ');
  const helping = helpSummary(item);
  return (
    // O cartão não é um botão: os botões de dentro não podem ficar aninhados num toque maior.
    <Card elevation="md" padding="none">
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Photo uri={item.animal.thumbUrl} style={styles.thumb} iconSize="md" />
          <View style={styles.cardText}>
            <View style={styles.pills}>
              <StatusPill urgency={item.urgency} />
              <StatusPill status={item.status} />
              {fresh ? <Badge kind="label" label="Novidade" tone="secondary" /> : null}
            </View>
            <AppText variant="h3" numberOfLines={1}>
              {title}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {placeOf(item.approxLabel)}
              {facts ? ` · ${facts}` : ''}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              Publicado {formatWhen(item.createdAt)}
              {item.lastActivityAt !== item.createdAt
                ? ` · novidade ${formatWhen(item.lastActivityAt)}`
                : ''}
            </AppText>
          </View>
        </View>
        {item.reasons.length > 0 ? (
          <AppText variant="bodySmallStrong" style={{ color: colors.onSecondarySoft }}>
            {item.reasons.join(' · ')}
          </AppText>
        ) : null}
        <View style={[styles.helpers, { backgroundColor: colors.surfaceMuted }]}>
          <View style={styles.faces}>
            {item.volunteers.map((person) => (
              <View key={person.handle} style={styles.face}>
                <Avatar name={person.name} uri={person.avatarUrl} size="sm" />
              </View>
            ))}
          </View>
          <AppText variant="bodySmall" style={styles.helpText}>
            {helping}
          </AppText>
        </View>
        <View style={styles.actions}>
          {canOffer ? (
            <Button
              title={item.viewer.offers.length > 0 ? 'Oferecer mais' : 'Oferecer ajuda'}
              icon="gift"
              variant="secondary"
              onPress={onOffer}
            />
          ) : null}
          <Button
            title="Ver resgate"
            icon="arrow-right"
            variant="outline"
            accessibilityLabel={`Ver resgate: ${title} em ${placeOf(item.approxLabel)}`}
            onPress={onOpen}
          />
          <Button title="Ver no mapa" icon="map" variant="ghost" onPress={onMap} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  stats: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  stat: { flex: 1 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  notice: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  card: { padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: 'row', gap: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: radius.md },
  cardText: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  helpers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  faces: { flexDirection: 'row' },
  face: { marginRight: -spacing.sm },
  helpText: { flex: 1, marginLeft: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
