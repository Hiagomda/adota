import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  Input,
  Notice,
  SectionHeader,
  SkeletonRows,
} from '../src/components/ui';
import { MatchCard } from '../src/lost/MatchCard';
import {
  furColors,
  lostSearchPath,
  toggleFurColor,
  type FurColor,
  type LostSearchForm,
  type LostSearchResult,
} from '../src/lost/lostMatch';
import type { MapPoint } from '../src/map/geo';
import { insideServiceArea } from '../src/map/serviceArea';
import { useAnimalGps } from '../src/place/gps';
import { PlacePicker } from '../src/place/PlacePicker';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

const speciesOptions = [
  { value: 'dog', label: 'Cachorro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Outro' },
] as const;
const sizeOptions = [
  { value: 'small', label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large', label: 'Grande' },
] as const;
const sexOptions = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Fêmea' },
] as const;

/**
 * "Encontrei um animal: é de alguém?" Compara o que a pessoa viu com os perdidos publicados
 * perto. Não precisa publicar nem entrar na conta; a resposta só tem dados públicos.
 */
export default function LostSearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const gps = useAnimalGps();
  const [species, setSpecies] = useState<LostSearchForm['species']>('dog');
  const [size, setSize] = useState<LostSearchForm['size']>(null);
  const [sex, setSex] = useState<LostSearchForm['sex']>(null);
  const [furs, setFurs] = useState<FurColor[]>([]);
  const [text, setText] = useState('');
  const [manual, setManual] = useState<MapPoint | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const point = manual ?? (gps.fix && insideServiceArea(gps.fix) ? gps.fix : null);

  const search = useQuery({
    queryKey: ['lost-search', submitted],
    queryFn: () => api<{ results: LostSearchResult[] }>(submitted ?? '', { token }),
    enabled: submitted !== null,
  });

  function submit() {
    if (!point) return;
    setSubmitted(
      lostSearchPath({
        species,
        size,
        sex,
        colors: furs,
        text,
        latitude: point.latitude,
        longitude: point.longitude,
      }),
    );
  }

  const results = search.data?.results ?? [];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header title="Encontrei um animal" onBack={() => router.back()} />
          <View style={styles.body}>
            <AppText color="textSecondary">
              Conte como ele é e onde está. A gente compara com os perdidos publicados perto para
              ver se é de alguém.
            </AppText>

            <View style={styles.group}>
              <AppText variant="bodyStrong">Espécie</AppText>
              <View style={styles.chips}>
                {speciesOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={species === option.value}
                    onPress={() => setSpecies(option.value)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.group}>
              <AppText variant="bodyStrong">Porte (se souber)</AppText>
              <View style={styles.chips}>
                {sizeOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={size === option.value}
                    onPress={() => setSize(size === option.value ? null : option.value)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.group}>
              <AppText variant="bodyStrong">Cores do pelo (até 3)</AppText>
              <View style={styles.chips}>
                {furColors.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={furs.includes(option.value)}
                    onPress={() => setFurs((current) => toggleFurColor(current, option.value))}
                  />
                ))}
              </View>
            </View>
            <View style={styles.group}>
              <AppText variant="bodyStrong">Sexo (se souber)</AppText>
              <View style={styles.chips}>
                {sexOptions.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={sex === option.value}
                    onPress={() => setSex(sex === option.value ? null : option.value)}
                  />
                ))}
              </View>
            </View>
            <Input
              label="Sinais (opcional)"
              placeholder="Ex.: coleira vermelha, manca, olho azul"
              value={text}
              onChangeText={setText}
              maxLength={300}
            />

            <SectionHeader title="Onde ele está" flush />
            <PlacePicker
              focus={point}
              accuracyM={manual ? null : (gps.fix?.accuracy ?? null)}
              urgency="medium"
              onChange={(next, fromUser) => {
                if (fromUser) setManual(next);
              }}
            />
            {!point ? (
              <Notice
                tone="info"
                message={gps.message}
                action={
                  gps.action
                    ? { label: gps.action.label, onPress: () => void gps.action?.run() }
                    : undefined
                }
              />
            ) : null}

            <Button
              title="Procurar entre os perdidos"
              icon="search"
              fullWidth
              disabled={!point}
              loading={search.isFetching}
              onPress={submit}
            />

            {submitted === null ? null : search.isLoading ? (
              <SkeletonRows />
            ) : search.isError ? (
              <ErrorState
                title="Não consegui procurar"
                body={messageFrom(search.error)}
                onRetry={() => void search.refetch()}
              />
            ) : results.length === 0 ? (
              <EmptyState
                pose="search"
                compact
                title="Nenhum perdido parecido perto daqui"
                body="Publique o animal: quando um tutor procurar, a gente cruza os dois e avisa vocês."
                actionLabel="Publicar o animal"
                onAction={() => router.push('/create')}
              />
            ) : (
              <View style={styles.results}>
                <Notice
                  tone="info"
                  message="São sugestões, não certeza. Abra o post e fale com o tutor pelo app. Ninguém deve cobrar para devolver um animal."
                />
                {results.map((result) => (
                  <MatchCard
                    key={result.post.id}
                    score={result.score}
                    strength={result.strength}
                    reasons={result.reasons}
                    distanceKm={result.distanceKm}
                    post={result.post}
                    when="Sumiu"
                    onOpen={() => router.push(`/post/${result.post.id}`)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  results: { gap: spacing.lg },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
