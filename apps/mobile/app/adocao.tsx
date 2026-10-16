import { useInfiniteQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadFeed, messageFrom } from '../src/api';
import { placeOf } from '../src/animalLabels';
import {
  AnimalCard,
  AppText,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  SearchBar,
  Skeleton,
} from '../src/components/ui';
import {
  activeFilterCount,
  adoptionQuery,
  noAdoptionFilters,
  type AdoptionFilters,
} from '../src/post/adoptionQuery';
import { ageBandOf, ageBands, careKeys, careQuestion, type CareKey } from '../src/post/care';
import { animalHeadline } from '../src/animalLabels';
import { useSession } from '../src/session';
import { screenColumn, size, spacing, useTheme } from '../src/theme';
import type { Post } from '../src/types';

const PLACE_DEBOUNCE_MS = 400;
const SKELETON_CARDS = 4;

const speciesOptions = [
  { value: 'dog', label: 'Cães' },
  { value: 'cat', label: 'Gatos' },
] as const;

const sizeOptions = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
] as const;

/** The two care facts people filter by most, kept on the quick row. */
const quickCare: CareKey[] = ['neutered', 'goodWithKids'];

function toggleCare(filters: AdoptionFilters, key: CareKey): AdoptionFilters {
  const has = filters.care.includes(key);
  return {
    ...filters,
    care: has ? filters.care.filter((item) => item !== key) : [...filters.care, key],
  };
}

function cardSubtitle(post: Post): string {
  const band = ageBandOf(post.animal.ageEstimate);
  const age = band ? ageBands.find((item) => item.value === band)?.label : null;
  return [placeOf(post.approxLabel), age].filter(Boolean).join(' · ');
}

export default function AdoptionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const [filters, setFilters] = useState<AdoptionFilters>(noAdoptionFilters);
  const [placeText, setPlaceText] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Typing a neighborhood waits a moment, so each letter is not a new search.
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((current) => ({ ...current, place: placeText })),
      PLACE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [placeText]);

  const query = adoptionQuery(filters);
  const feed = useInfiniteQuery({
    queryKey: ['adoption', query, token],
    queryFn: ({ pageParam }) => loadFeed(token, adoptionQuery(filters, pageParam ?? undefined)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? [];
  const extra = activeFilterCount({ ...filters, species: undefined, place: '' });

  const filterRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {speciesOptions.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={filters.species === option.value}
          onPress={() =>
            setFilters((current) => ({
              ...current,
              species: current.species === option.value ? undefined : option.value,
            }))
          }
        />
      ))}
      {quickCare.map((key) => (
        <Chip
          key={key}
          label={careQuestion[key]}
          selected={filters.care.includes(key)}
          onPress={() => setFilters((current) => toggleCare(current, key))}
        />
      ))}
      <Chip
        label={extra > 0 ? `Mais filtros (${extra})` : 'Mais filtros'}
        icon="sliders"
        selected={extra > 0}
        onPress={() => setSheetOpen(true)}
      />
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.column}>
        <Header title="Para adoção" large onBack={() => router.back()} />
        <View style={styles.search}>
          <SearchBar
            value={placeText}
            onChangeText={setPlaceText}
            placeholder="Bairro, por exemplo Marco"
            accessibilityLabel="Filtrar por bairro"
          />
        </View>
        {filterRow}
        {feed.isLoading ? (
          <View style={styles.grid} accessible accessibilityLabel="Carregando animais">
            {Array.from({ length: SKELETON_CARDS }, (_, index) => (
              <Skeleton
                key={index}
                width={size.animalCompact.width}
                height={size.animalCompact.height}
                radius="xl"
              />
            ))}
          </View>
        ) : feed.isError ? (
          <ErrorState
            title="Não consegui carregar os animais"
            body={messageFrom(feed.error)}
            onRetry={() => void feed.refetch()}
          />
        ) : (
          <FlashList
            style={styles.screen}
            data={posts}
            numColumns={2}
            keyExtractor={(post) => post.id}
            contentContainerStyle={{
              paddingHorizontal: spacing.md,
              paddingBottom: insets.bottom + spacing.xxl,
            }}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching && !feed.isFetchingNextPage}
                onRefresh={() => void feed.refetch()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
            }}
            onEndReachedThreshold={0.6}
            ListEmptyComponent={
              <EmptyState
                pose="search"
                title={
                  activeFilterCount(filters) > 0
                    ? 'Nenhum animal com esses filtros'
                    : 'Nenhum animal para adoção agora'
                }
                body={
                  activeFilterCount(filters) > 0
                    ? 'Tire um filtro ou procure em outro bairro.'
                    : 'Quando alguém colocar um animal para adoção, ele aparece aqui.'
                }
                actionLabel={activeFilterCount(filters) > 0 ? 'Limpar filtros' : undefined}
                onAction={
                  activeFilterCount(filters) > 0
                    ? () => {
                        setPlaceText('');
                        setFilters(noAdoptionFilters);
                      }
                    : undefined
                }
              />
            }
            renderItem={({ item, index }) => (
              <View style={styles.cell}>
                <AnimalCard
                  variant="compact"
                  index={index}
                  photoUri={item.media[0]?.thumbUrl || item.media[0]?.url}
                  title={animalHeadline(item.animal)}
                  subtitle={cardSubtitle(item)}
                  onPress={() => router.push(`/post/${item.id}`)}
                />
              </View>
            )}
          />
        )}
      </View>

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Filtros">
        <View style={styles.sheet}>
          <AppText variant="bodyStrong">Porte</AppText>
          <View style={styles.wrap}>
            {sizeOptions.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.size === option.value}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    size: current.size === option.value ? undefined : option.value,
                  }))
                }
              />
            ))}
          </View>
          <AppText variant="bodyStrong">Idade</AppText>
          <View style={styles.wrap}>
            {ageBands.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={filters.age === option.value}
                onPress={() =>
                  setFilters((current) => ({
                    ...current,
                    age: current.age === option.value ? undefined : option.value,
                  }))
                }
              />
            ))}
          </View>
          <AppText variant="bodyStrong">Cuidados</AppText>
          <View style={styles.wrap}>
            {careKeys.map((key) => (
              <Chip
                key={key}
                label={careQuestion[key]}
                selected={filters.care.includes(key)}
                onPress={() => setFilters((current) => toggleCare(current, key))}
              />
            ))}
          </View>
          <Button title="Ver animais" fullWidth onPress={() => setSheetOpen(false)} />
          <Button
            title="Limpar filtros"
            variant="ghost"
            fullWidth
            onPress={() => {
              setPlaceText('');
              setFilters(noAdoptionFilters);
            }}
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, ...screenColumn },
  search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
    paddingTop: spacing.md,
  },
  cell: { alignItems: 'center', paddingVertical: spacing.sm },
  sheet: { gap: spacing.md, paddingBottom: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
