import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadMe, messageFrom } from '../src/api';
import { animalHeadline, placeOf } from '../src/animalLabels';
import { CampaignTile } from '../src/campaign/CampaignTile';
import type { CampaignSummary } from '../src/campaign/campaign';
import {
  AnimalCard,
  AppText,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  SectionHeader,
  Segmented,
  SkeletonRows,
  Touchable,
  type IconName,
} from '../src/components/ui';
import { toneColors } from '../src/components/ui/tones';
import { Cupu } from '../src/cupu/Cupu';
import { EventCard } from '../src/events/EventCard';
import type { EventList } from '../src/events/agenda';
import { INTEREST_CARD_WIDTH, InterestCard } from '../src/ngo/InterestCard';
import {
  accentTone,
  animalsOf,
  averageWaitDays,
  greeting,
  panelHighlight,
  waitShort,
  type AnimalGroup,
  type NgoPanel,
} from '../src/ngo/panel';
import { PanelHero } from '../src/ngo/PanelHero';
import { ThemeSheet } from '../src/ngo/ThemeSheet';
import { waitingShort } from '../src/post/waiting';
import { useSession } from '../src/session';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';

const MAX_EVENTS = 3;
const MAX_CAMPAIGNS = 3;
const CUPU_SIZE = 96;
/** Quanto o cartão de números sobe sobre a onda da capa. */
const STATS_LIFT = spacing.xxxl + spacing.lg;

/**
 * Painel da ONG: a casa da ONG verificada dentro do app. Capa na cor que ela escolheu, o recado do
 * Cupu com o que fazer agora, as fichas de adoção, os animais por fase, as campanhas e a agenda.
 */
export default function NgoPanelScreen() {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [group, setGroup] = useState<AnimalGroup>('adoption');
  const [themeOpen, setThemeOpen] = useState(false);
  const [pulling, setPulling] = useState(false);

  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const allowed = Boolean(
    me.data?.verified && (me.data.role === 'ngo' || me.data.role === 'protector'),
  );
  const panel = useQuery({
    queryKey: ['ngo-panel', token],
    queryFn: () => api<NgoPanel>('/me/ngo-panel', { token }),
    enabled: allowed,
  });
  const campaigns = useQuery({
    queryKey: ['campaigns', 'mine', token],
    queryFn: () => api<{ campaigns: CampaignSummary[] }>('/campaigns?status=mine', { token }),
    enabled: allowed,
  });
  const events = useQuery({
    queryKey: ['events', 'organizing', token],
    queryFn: () => api<EventList>('/events?mine=organizing', { token }),
    enabled: allowed,
  });

  async function refresh() {
    setPulling(true);
    try {
      await Promise.all([panel.refetch(), campaigns.refetch(), events.refetch()]);
    } finally {
      setPulling(false);
    }
  }

  const data = panel.data;
  const openPost = (id: string) => router.push(`/post/${id}`);

  // Antes de ter o painel, a tela usa o cabeçalho comum do app.
  if (!data) {
    let state;
    if (!token) {
      state = (
        <EmptyState
          pose="wave"
          title="Entre para ver o painel"
          body="O painel da ONG fica ligado à conta verificada."
          actionLabel="Entrar"
          onAction={() => router.push('/login')}
        />
      );
    } else if (me.isLoading || (allowed && panel.isLoading)) {
      state = <SkeletonRows />;
    } else if (!allowed) {
      state = (
        <EmptyState
          pose="sit"
          title="O painel é das ONGs verificadas"
          body="Com o selo, você acompanha os animais, as fichas de adoção, as campanhas e a agenda numa tela só."
          actionLabel="Pedir o selo"
          onAction={() => router.push('/ong')}
        />
      );
    } else {
      state = (
        <ErrorState
          title="Não consegui abrir o painel"
          body={messageFrom(panel.error)}
          onRetry={() => void panel.refetch()}
        />
      );
    }
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <Header title="Painel da ONG" large onBack={() => router.back()} />
          {state}
        </View>
      </SafeAreaView>
    );
  }

  const accent = toneColors(colors, accentTone(data.theme.accent));
  const highlight = panelHighlight(data);
  const wait = averageWaitDays(data.animals);
  const shown = animalsOf(data.animals, group);
  const counts = {
    adoption: animalsOf(data.animals, 'adoption').length,
    care: animalsOf(data.animals, 'care').length,
    adopted: animalsOf(data.animals, 'adopted').length,
  };
  const myCampaigns = (campaigns.data?.campaigns ?? [])
    .filter((item) => item.phase === 'active')
    .slice(0, MAX_CAMPAIGNS);
  const myEvents = (events.data?.events ?? [])
    .filter((item) => item.state === 'scheduled' || item.state === 'happening')
    .slice(0, MAX_EVENTS);
  const stats = [
    { value: String(data.stats.newInterests), label: 'fichas novas' },
    { value: String(data.stats.forAdoption), label: 'esperando' },
    { value: String(data.stats.adoptedThisMonth), label: 'adotados no mês' },
    { value: waitShort(wait), label: 'espera média' },
  ];
  const shortcuts: { title: string; icon: IconName; href: Href }[] = [
    { title: 'Publicar animal', icon: 'plus-circle', href: '/create' },
    { title: 'Abrir campanha', icon: 'heart', href: '/campanha/nova' },
    { title: 'Marcar evento', icon: 'calendar', href: '/agenda/novo' },
    { title: 'Achar Casa Amiga', icon: 'home', href: '/casa-amiga' },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <PanelHero
          topInset={insets.top}
          panel={data}
          greeting={`${greeting()}! Este é o seu painel.`}
          onBack={() => router.back()}
          onTheme={() => setThemeOpen(true)}
          onProfile={() => router.push(`/user/${data.org.handle}`)}
        />

        <View style={styles.column}>
          {/* Os números sobem por cima da onda da capa. */}
          <View style={[styles.stats, shadows.lg, { backgroundColor: colors.surface }]}>
            {stats.map((stat, index) => (
              <View
                key={stat.label}
                accessible
                accessibilityLabel={`${stat.label}: ${stat.value}`}
                style={[
                  styles.stat,
                  index > 0 ? { borderLeftWidth: 1, borderLeftColor: colors.border } : null,
                ]}
              >
                <AppText variant="h2" style={{ color: accent.foreground }} numberOfLines={1}>
                  {stat.value}
                </AppText>
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={styles.statLabel}
                  numberOfLines={2}
                >
                  {stat.label}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color="textSecondary" style={styles.totals}>
            {data.stats.rescue} em resgate · {data.stats.care} em cuidado ·{' '}
            {data.stats.adoptedTotal === 1 ? '1 adotado' : `${data.stats.adoptedTotal} adotados`}{' '}
            desde o começo
          </AppText>

          {/* O recado do Cupu: a coisa mais importante para fazer agora. */}
          <View style={[styles.highlight, { backgroundColor: accent.background }]}>
            <Cupu size={CUPU_SIZE} pose={highlight.pose} scene={null} />
            <View style={styles.highlightText}>
              <AppText variant="h3" style={{ color: accent.foreground }}>
                {highlight.title}
              </AppText>
              <AppText variant="bodySmall" style={{ color: accent.foreground }}>
                {highlight.body}
              </AppText>
            </View>
          </View>

          <SectionHeader title="Fichas de adoção" subtitle="Toque para ver todas as respostas" />
          {data.recentInterests.length === 0 ? (
            <View style={styles.pad}>
              <View style={[styles.emptyBox, { borderColor: colors.borderStrong }]}>
                <Icon name="inbox" size="lg" color={colors.textSecondary} />
                <AppText color="textSecondary" style={styles.emptyText}>
                  Ainda não chegou ficha. Quando alguém tocar em “Quero adotar”, ela aparece aqui.
                </AppText>
              </View>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={INTEREST_CARD_WIDTH + spacing.md}
              decelerationRate="fast"
              contentContainerStyle={styles.rail}
            >
              {data.recentInterests.map((interest) => (
                <InterestCard
                  key={`${interest.postId}:${interest.person.id}`}
                  interest={interest}
                  onPress={() => openPost(interest.postId)}
                />
              ))}
            </ScrollView>
          )}

          <SectionHeader title="Seus animais" />
          <View style={styles.pad}>
            <Segmented
              accessibilityLabel="Fase dos animais"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'adoption', label: `Adoção · ${counts.adoption}` },
                { value: 'care', label: `Cuidado · ${counts.care}` },
                { value: 'adopted', label: `Adotados · ${counts.adopted}` },
              ]}
            />
          </View>
          {shown.length === 0 ? (
            <View style={styles.pad}>
              <View style={[styles.emptyBox, { borderColor: colors.borderStrong }]}>
                <Icon name="feather" size="lg" color={colors.textSecondary} />
                <AppText color="textSecondary" style={styles.emptyText}>
                  {group === 'adoption'
                    ? 'Nenhum animal para adoção agora.'
                    : group === 'care'
                      ? 'Nenhum animal em resgate ou em cuidado.'
                      : 'Os finais felizes aparecem aqui.'}
                </AppText>
              </View>
            </View>
          ) : (
            <View style={styles.grid}>
              {shown.map((item, index) => (
                <AnimalCard
                  key={item.post.id}
                  variant="compact"
                  index={index}
                  photoUri={item.post.media[0]?.thumbUrl}
                  title={animalHeadline(item.post.animal)}
                  subtitle={
                    item.newInterests > 0
                      ? item.newInterests === 1
                        ? '1 ficha nova'
                        : `${item.newInterests} fichas novas`
                      : ((item.post.status === 'for_adoption'
                          ? waitingShort(item.post.adoptionSince)
                          : null) ?? placeOf(item.post.approxLabel))
                  }
                  status={item.post.status}
                  onPress={() => openPost(item.post.id)}
                />
              ))}
            </View>
          )}

          <SectionHeader title="Fazer agora" />
          <View style={styles.tiles}>
            {shortcuts.map((shortcut) => (
              <Touchable
                key={shortcut.title}
                accessibilityRole="button"
                accessibilityLabel={shortcut.title}
                haptic="light"
                pressedScale={0.97}
                onPress={() => router.push(shortcut.href)}
                style={[styles.tile, { backgroundColor: accent.background }]}
              >
                <View style={[styles.tileIcon, { backgroundColor: colors.surface }]}>
                  <Icon name={shortcut.icon} size="lg" color={accent.foreground} />
                </View>
                <AppText variant="bodySmallStrong" style={{ color: accent.foreground }}>
                  {shortcut.title}
                </AppText>
              </Touchable>
            ))}
          </View>

          <SectionHeader
            title="Campanhas"
            actionLabel="Ver todas"
            onAction={() => router.push('/campanhas')}
          />
          <View style={styles.list}>
            {myCampaigns.map((campaign) => (
              <CampaignTile
                key={campaign.id}
                campaign={campaign}
                onPress={() => router.push(`/campanha/${campaign.id}`)}
              />
            ))}
            {campaigns.isSuccess && myCampaigns.length === 0 ? (
              <Card elevation="none" style={{ backgroundColor: colors.surfaceMuted }}>
                <AppText color="textSecondary">
                  Nenhuma campanha aberta. Ração, castração ou veterinário: o extrato fica aberto
                  para quem doa.
                </AppText>
              </Card>
            ) : null}
          </View>

          <SectionHeader
            title="Agenda"
            actionLabel="Ver agenda"
            onAction={() => router.push('/agenda')}
          />
          <View style={styles.list}>
            {myEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onOpen={() => router.push(`/evento/${event.id}`)}
              />
            ))}
            {events.isSuccess && myEvents.length === 0 ? (
              <Card elevation="none" style={{ backgroundColor: colors.surfaceMuted }}>
                <AppText color="textSecondary">
                  Nenhum evento marcado. Uma feira de adoção costuma render várias fichas.
                </AppText>
              </Card>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <ThemeSheet
        visible={themeOpen}
        token={token}
        accent={data.theme.accent}
        tagline={data.theme.tagline}
        onClose={() => setThemeOpen(false)}
        onSaved={() => {
          setThemeOpen(false);
          void client.invalidateQueries({ queryKey: ['ngo-panel'] });
        }}
      />
    </View>
  );
}

const TILE_ICON = 48;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  stats: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: -STATS_LIFT,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs, gap: 2 },
  statLabel: { textAlign: 'center' },
  totals: { textAlign: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    borderRadius: radius.xl,
  },
  highlightText: { flex: 1, gap: spacing.xs },
  pad: { paddingHorizontal: spacing.lg },
  rail: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'flex-start',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  emptyBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  emptyText: { textAlign: 'center' },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tileIcon: {
    width: TILE_ICON,
    height: TILE_ICON,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
