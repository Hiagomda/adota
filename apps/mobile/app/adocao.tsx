import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, messageFrom } from '../src/api';
import { parseList, postListSchema, postSchema } from '../src/apiSchemas';
import {
  AnimalCard,
  AppText,
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  HeroCarousel,
  SearchBar,
  SectionHeader,
  Segmented,
  Skeleton,
  type HeroSlide,
} from '../src/components/ui';
import {
  activeFilterCount,
  adoptionQuery,
  noAdoptionFilters,
  type AdoptionFilters,
  type AdoptionShelf,
} from '../src/post/adoptionQuery';
import { ageBandOf, ageBands, careKeys, careQuestion, type CareKey } from '../src/post/care';
import { animalHeadline, placeOf } from '../src/animalLabels';
import { waitingShort } from '../src/post/waiting';
import { useSession } from '../src/session';
import { screenColumn, size, spacing, useTheme } from '../src/theme';
import type { Post } from '../src/types';

const PLACE_DEBOUNCE_MS = 400;
const SKELETON_CARDS = 4;
const HERO_SLIDES = 5;

const speciesOptions = [
  { value: 'dog', label: 'Cães' },
  { value: 'cat', label: 'Gatos' },
] as const;

const sizeOptions = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
] as const;

const shelves = [
  { value: 'available', label: 'Para adoção' },
  { value: 'adopted', label: 'Adotados' },
] as const;

/** Os dois cuidados mais filtrados, que ficam na fileira rápida. */
const quickCare: CareKey[] = ['neutered', 'goodWithKids'];

function toggleCare(filters: AdoptionFilters, key: CareKey): AdoptionFilters {
  const has = filters.care.includes(key);
  return {
    ...filters,
    care: has ? filters.care.filter((item) => item !== key) : [...filters.care, key],
  };
}

function cardSubtitle(post: Post, shelf: AdoptionShelf): string {
  if (shelf === 'adopted') return `Adotado · ${placeOf(post.approxLabel)}`;
  const band = ageBandOf(post.animal.ageEstimate);
  const age = band ? ageBands.find((item) => item.value === band)?.label : null;
  return [placeOf(post.approxLabel), age].filter(Boolean).join(' · ');
}

/** Quem está para adoção há semanas. Adultos e pretos costumam ficar para trás. */
async function loadWaiting(token: string | null, species: string | undefined): Promise<Post[]> {
  const path = species ? `/adoption/waiting?species=${species}` : '/adoption/waiting';
  const page = await api(path, { token, schema: postListSchema });
  return parseList(postSchema, page.posts, path);
}

export default function AdoptionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  // "Adotados" na Início abre esta tela já na segunda aba.
  const { aba } = useLocalSearchParams<{ aba?: string }>();
  const [shelf, setShelf] = useState<AdoptionShelf>(aba === 'adotados' ? 'adopted' : 'available');
  const [filters, setFilters] = useState<AdoptionFilters>(noAdoptionFilters);
  const [placeText, setPlaceText] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Digitar um bairro espera um instante, para cada letra não virar uma busca nova.
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((current) => ({ ...current, place: placeText })),
      PLACE_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [placeText]);

  const query = adoptionQuery(filters, undefined, shelf);
  const feed = useInfiniteQuery({
    queryKey: ['adoption', query, token],
    queryFn: ({ pageParam }) =>
      loadFeed(token, adoptionQuery(filters, pageParam ?? undefined, shelf)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? [];
  // Sem filtros, os primeiros animais ganham o banner de destaque, como num catálogo de streaming.
  const showHero = shelf === 'available' && activeFilterCount(filters) === 0 && posts.length > 0;
  const heroSlides: HeroSlide[] = posts.slice(0, HERO_SLIDES).map((post) => ({
    id: post.id,
    photoUri: post.media[0]?.url || post.media[0]?.thumbUrl,
    tag: 'Para adoção',
    title: animalHeadline(post.animal),
    subtitle: cardSubtitle(post, shelf),
  }));
  const extra = activeFilterCount({ ...filters, species: undefined, place: '' });
  // A fileira só aparece na vitrine sem filtros além da espécie, para não esconder resultado.
  const showWaiting = shelf === 'available' && extra === 0 && filters.place.trim() === '';
  const waiting = useQuery({
    queryKey: ['adoption', 'waiting', filters.species ?? 'all', token],
    queryFn: () => loadWaiting(token, filters.species),
    enabled: showWaiting,
  });
  const waitingPosts = showWaiting ? (waiting.data ?? []) : [];

  const waitingRow =
    waitingPosts.length > 0 ? (
      <View style={styles.waiting}>
        <SectionHeader
          title="Esperando há mais tempo"
          subtitle="Estão para adoção há semanas. Dê uma chance a eles."
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {waitingPosts.map((post, index) => (
            <AnimalCard
              key={post.id}
              variant="compact"
              index={index}
              photoUri={post.media[0]?.thumbUrl || post.media[0]?.url}
              title={animalHeadline(post.animal)}
              subtitle={waitingShort(post.adoptionSince) ?? placeOf(post.approxLabel)}
              onPress={() => router.push(`/post/${post.id}`)}
            />
          ))}
        </ScrollView>
        <AppText variant="h3" style={styles.allTitle}>
          Todos para adoção
        </AppText>
      </View>
    ) : null;

  const filterRow = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipRow}
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
        <Header title="Adoção" large onBack={() => router.back()} />
        <View style={styles.shelf}>
          <Segmented
            options={shelves}
            value={shelf}
            onChange={setShelf}
            accessibilityLabel="Ver animais para adoção ou já adotados"
          />
        </View>
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
                onRefresh={() => {
                  void feed.refetch();
                  if (showWaiting) void waiting.refetch();
                }}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            onEndReached={() => {
              if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
            }}
            onEndReachedThreshold={0.6}
            ListHeaderComponent={
              showHero || waitingRow ? (
                <>
                  {showHero ? (
                    <View style={styles.hero}>
                      <HeroCarousel
                        slides={heroSlides}
                        actionLabel="Quero conhecer"
                        onOpen={(id) => router.push(`/post/${id}`)}
                      />
                    </View>
                  ) : null}
                  {waitingRow}
                </>
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                pose={shelf === 'adopted' ? 'home' : 'search'}
                title={
                  activeFilterCount(filters) > 0
                    ? 'Nenhum animal com esses filtros'
                    : shelf === 'adopted'
                      ? 'Nenhuma adoção ainda'
                      : 'Nenhum animal para adoção agora'
                }
                body={
                  activeFilterCount(filters) > 0
                    ? 'Tire um filtro ou procure em outro bairro.'
                    : shelf === 'adopted'
                      ? 'Quando uma adoção for concluída, o animal aparece aqui com a família nova.'
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
                  subtitle={cardSubtitle(item, shelf)}
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
  shelf: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  search: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  // Uma rolagem horizontal numa coluna cresce até ocupar tudo, a menos que se diga o contrário.
  chipRow: { flexGrow: 0 },
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
  // O banner vai de ponta a ponta: desfaz o recuo lateral da grade.
  hero: { marginHorizontal: -spacing.md, marginBottom: spacing.md, overflow: 'hidden' },
  cell: { alignItems: 'center', paddingVertical: spacing.sm },
  // A grade já tem a margem lateral; a fileira e o título vão até a borda dela.
  waiting: { marginHorizontal: -spacing.md, paddingTop: spacing.sm, gap: spacing.sm },
  rail: { paddingHorizontal: spacing.lg, gap: spacing.md },
  allTitle: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sheet: { gap: spacing.md, paddingBottom: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
