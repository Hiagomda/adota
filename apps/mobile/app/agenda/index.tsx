import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Segmented,
  SkeletonRows,
  Touchable,
  useToast,
  type IconName,
} from '../../src/components/ui';
import { reportError } from '../../src/crash/reporter';
import {
  belemDayKey,
  belemMonthKey,
  categories,
  categoryIcons,
  categoryLabels,
  eventsByDay,
  eventsPath,
  monthGrid,
  monthLabel,
  periodLabels,
  shiftMonth,
  type CommunityEvent,
  type EventCategory,
  type EventFilters,
  type EventList,
  type EventPeriod,
} from '../../src/events/agenda';
import { CupuTip } from '../../src/cupu/CupuTip';
import { EventCard } from '../../src/events/EventCard';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

type View_ = 'list' | 'calendar' | 'mine';

const viewOptions = [
  { value: 'list', label: 'Lista' },
  { value: 'calendar', label: 'Calendário' },
  { value: 'mine', label: 'Minha agenda' },
] as const;

const mineOptions = [
  { value: 'registered', label: 'Inscrições' },
  { value: 'organizing', label: 'Que organizo' },
] as const;

const periods: EventPeriod[] = ['upcoming', 'today', 'week', 'month', 'past'];
const weekdayInitials = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const NEAR_KM = 10;

/**
 * Agenda de feiras, vacinação, castração, arrecadações e ações da comunidade. Lista com filtros,
 * calendário do mês e a agenda da própria pessoa. Tudo no horário de Belém.
 */
export default function AgendaScreen() {
  const params = useLocalSearchParams<{ categoria?: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const token = useSession((state) => state.token);
  const initialCategory = categories.includes(params.categoria as EventCategory)
    ? (params.categoria as EventCategory)
    : null;
  const [view, setView] = useState<View_>('list');
  const [category, setCategory] = useState<EventCategory | null>(initialCategory);
  const [period, setPeriod] = useState<EventPeriod>('upcoming');
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [near, setNear] = useState<EventFilters['near']>(null);
  const [locating, setLocating] = useState(false);
  const [month, setMonth] = useState(() => belemMonthKey());
  const [day, setDay] = useState<string | null>(null);
  const [mine, setMine] = useState<'registered' | 'organizing'>('registered');

  const filters: EventFilters =
    view === 'calendar'
      ? { category, month, neighborhood, near }
      : view === 'mine'
        ? { mine, period: 'upcoming' }
        : { category, period, neighborhood, near };
  const needsLogin = view === 'mine' && !token;

  const events = useInfiniteQuery({
    queryKey: ['events', eventsPath(filters), token],
    queryFn: ({ pageParam }) =>
      api<EventList>(eventsPath({ ...filters, cursor: pageParam }), { token }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !needsLogin,
  });
  const regions = useQuery({
    queryKey: ['events', 'regions'],
    queryFn: () => api<{ regions: { neighborhood: string; events: number }[] }>('/events/regions'),
  });
  const list = useMemo(
    () => events.data?.pages.flatMap((page) => page.events) ?? [],
    [events.data],
  );
  const canCreate = events.data?.pages[0]?.canCreate ?? Boolean(token);
  const byDay = useMemo(() => eventsByDay(list), [list]);
  const shown: CommunityEvent[] = view === 'calendar' && day ? (byDay.get(day) ?? []) : list;

  async function toggleNear() {
    if (near) {
      setNear(null);
      return;
    }
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        toast.show('Sem a localização não dá para achar eventos perto de você.', 'error');
        return;
      }
      const position =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setNeighborhood(null);
      setNear({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radiusKm: NEAR_KM,
      });
    } catch (error) {
      reportError(error, { source: 'handled', where: 'agenda:near' });
      toast.show('Não consegui pegar sua localização. Tente de novo.', 'error');
    } finally {
      setLocating(false);
    }
  }

  function open(event: CommunityEvent) {
    router.push(`/evento/${event.id}`);
  }

  const filtersBar =
    view === 'mine' ? (
      <View style={styles.padded}>
        <Segmented
          options={mineOptions}
          value={mine}
          onChange={setMine}
          variant="underline"
          accessibilityLabel="Quais eventos mostrar"
        />
      </View>
    ) : (
      <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          <Chip label="Todos" selected={category === null} onPress={() => setCategory(null)} />
          {categories.map((option) => (
            <Chip
              key={option}
              label={categoryLabels[option]}
              icon={categoryIcons[option] as IconName}
              selected={category === option}
              onPress={() => setCategory(category === option ? null : option)}
            />
          ))}
        </ScrollView>
        {view === 'list' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {periods.map((option) => (
              <Chip
                key={option}
                label={periodLabels[option]}
                selected={period === option}
                onPress={() => setPeriod(option)}
              />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          <Chip
            label={locating ? 'Buscando...' : `Até ${NEAR_KM} km de mim`}
            icon="navigation"
            selected={Boolean(near)}
            disabled={locating}
            onPress={() => void toggleNear()}
          />
          {(regions.data?.regions ?? []).map((region) => (
            <Chip
              key={region.neighborhood}
              label={region.neighborhood}
              icon="map-pin"
              selected={neighborhood === region.neighborhood}
              onPress={() => {
                setNear(null);
                setNeighborhood(neighborhood === region.neighborhood ? null : region.neighborhood);
              }}
            />
          ))}
        </ScrollView>
      </>
    );

  const calendar =
    view === 'calendar' ? (
      <View
        style={[styles.calendar, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.monthRow}>
          <IconButton
            icon="chevron-left"
            accessibilityLabel="Mês anterior"
            onPress={() => {
              setDay(null);
              setMonth(shiftMonth(month, -1));
            }}
          />
          <AppText variant="h3" style={styles.monthTitle}>
            {monthLabel(month)}
          </AppText>
          <IconButton
            icon="chevron-right"
            accessibilityLabel="Próximo mês"
            onPress={() => {
              setDay(null);
              setMonth(shiftMonth(month, 1));
            }}
          />
        </View>
        <View style={styles.week}>
          {weekdayInitials.map((initial, index) => (
            <AppText key={index} variant="caption" color="textSecondary" style={styles.weekday}>
              {initial}
            </AppText>
          ))}
        </View>
        {monthGrid(month).map((week) => (
          <View key={week[0]?.key} style={styles.week}>
            {week.map((cell) => {
              const count = byDay.get(cell.key)?.length ?? 0;
              const selected = day === cell.key;
              const today = cell.key === belemDayKey(new Date());
              return (
                <Touchable
                  key={cell.key}
                  style={styles.cell}
                  disabled={!cell.inMonth}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Dia ${cell.day}${count > 0 ? `, ${count} ${count === 1 ? 'evento' : 'eventos'}` : ', sem eventos'}`}
                  onPress={() => setDay(selected ? null : cell.key)}
                >
                  <View
                    style={[
                      styles.dayBubble,
                      selected ? { backgroundColor: colors.primary } : null,
                      !selected && today ? { borderColor: colors.primary, borderWidth: 1 } : null,
                    ]}
                  >
                    <AppText
                      variant="bodySmallStrong"
                      style={{
                        color: selected
                          ? colors.onPrimary
                          : cell.inMonth
                            ? colors.text
                            : colors.textDisabled,
                      }}
                    >
                      {cell.day}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          count > 0 && cell.inMonth ? colors.secondary : 'transparent',
                      },
                    ]}
                  />
                </Touchable>
              );
            })}
          </View>
        ))}
        <AppText variant="caption" color="textSecondary">
          {day
            ? `${shown.length} ${shown.length === 1 ? 'evento' : 'eventos'} no dia. Toque de novo para ver o mês.`
            : 'Toque num dia com bolinha para ver os eventos.'}
        </AppText>
      </View>
    ) : null;

  const empty = needsLogin ? (
    <EmptyState
      pose="sit"
      title="Entre para ver sua agenda"
      body="Os eventos em que você se inscreveu e os que você organiza ficam aqui."
      actionLabel="Entrar"
      onAction={() => router.push('/login')}
    />
  ) : (
    <EmptyState
      pose="sit"
      title={
        view === 'mine'
          ? mine === 'registered'
            ? 'Nenhuma inscrição ainda'
            : 'Você ainda não organizou eventos'
          : 'Nenhum evento por aqui'
      }
      body={
        view === 'mine'
          ? 'Escolha um evento na lista e toque em Quero participar.'
          : 'Mude os filtros ou marque um mutirão para a sua rua: a agenda é de todo mundo.'
      }
      actionLabel={canCreate && token ? 'Marcar um evento' : undefined}
      onAction={canCreate && token ? () => router.push('/agenda/novo') : undefined}
    />
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={events.isRefetching}
            onRefresh={() => void events.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header title="Agenda" large onBack={() => router.back()} />
          <AppText color="textSecondary" style={styles.padded}>
            Feiras de adoção, vacinação, castração, arrecadações e mutirões em Belém. Horários de
            Belém.
          </AppText>
          <CupuTip context="fairs" style={styles.padded} />
          <View style={styles.padded}>
            <Segmented
              options={viewOptions}
              value={view}
              onChange={(next) => {
                setDay(null);
                setView(next);
              }}
              accessibilityLabel="Como ver a agenda"
            />
          </View>
          {token && canCreate ? (
            <View style={styles.padded}>
              <Button
                title="Marcar um evento"
                icon="plus"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/agenda/novo')}
              />
            </View>
          ) : null}
          {filtersBar}
          {calendar}
          {events.isLoading && !needsLogin ? (
            <View style={styles.list}>
              <SkeletonRows />
            </View>
          ) : events.isError ? (
            <ErrorState
              title="Não consegui carregar a agenda"
              body={messageFrom(events.error)}
              onRetry={() => void events.refetch()}
            />
          ) : shown.length === 0 ? (
            empty
          ) : (
            <View style={styles.list}>
              {shown.map((event) => (
                <EventCard key={event.id} event={event} onOpen={open} />
              ))}
              {events.hasNextPage && !(view === 'calendar' && day) ? (
                <Button
                  title="Ver mais eventos"
                  variant="outline"
                  loading={events.isFetchingNextPage}
                  onPress={() => void events.fetchNextPage()}
                />
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  padded: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingTop: spacing.sm },
  calendar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  monthTitle: { flex: 1, textAlign: 'center' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs, minHeight: 44 },
  weekday: { flex: 1, textAlign: 'center' },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
