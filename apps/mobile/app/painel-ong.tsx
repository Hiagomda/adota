import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadMe, messageFrom } from '../src/api';
import { animalHeadline, placeOf, speciesLabel } from '../src/animalLabels';
import { CampaignTile } from '../src/campaign/CampaignTile';
import type { CampaignSummary } from '../src/campaign/campaign';
import {
  ActionCard,
  AppText,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  PetPattern,
  Photo,
  SectionHeader,
  Segmented,
  SkeletonRows,
  StatCard,
  StatusPill,
} from '../src/components/ui';
import { toneColors } from '../src/components/ui/tones';
import { EventCard } from '../src/events/EventCard';
import type { EventList } from '../src/events/agenda';
import { formatWhen } from '../src/format';
import {
  accentTone,
  animalsOf,
  averageWaitDays,
  greeting,
  interestLabel,
  waitShort,
  type AnimalGroup,
  type NgoPanel,
  type PanelAnimal,
  type PanelInterest,
} from '../src/ngo/panel';
import { ThemeSheet } from '../src/ngo/ThemeSheet';
import { answerLines } from '../src/post/adoptionInterest';
import { waitingShort } from '../src/post/waiting';
import { useSession } from '../src/session';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';

const MAX_EVENTS = 3;
const MAX_CAMPAIGNS = 3;

/**
 * Painel da ONG: a casa da ONG verificada dentro do app. Mostra quem mandou ficha, os animais por
 * fase, as campanhas e a agenda, na cor que a ONG escolheu.
 */
export default function NgoPanelScreen() {
  const router = useRouter();
  const { colors } = useTheme();
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
  const tone = toneColors(colors, accentTone(data?.theme.accent));
  const openPost = (id: string) => router.push(`/post/${id}`);

  let body;
  if (!token) {
    body = (
      <EmptyState
        pose="wave"
        title="Entre para ver o painel"
        body="O painel da ONG fica ligado à conta verificada."
        actionLabel="Entrar"
        onAction={() => router.push('/login')}
      />
    );
  } else if (me.isLoading) {
    body = <SkeletonRows />;
  } else if (!allowed) {
    body = (
      <EmptyState
        pose="sit"
        title="O painel é das ONGs verificadas"
        body="Com o selo, você acompanha os animais, as fichas de adoção, as campanhas e a agenda numa tela só."
        actionLabel="Pedir o selo"
        onAction={() => router.push('/ong')}
      />
    );
  } else if (panel.isLoading) {
    body = <SkeletonRows />;
  } else if (panel.isError || !data) {
    body = (
      <ErrorState
        title="Não consegui abrir o painel"
        body={messageFrom(panel.error)}
        onRetry={() => void panel.refetch()}
      />
    );
  } else {
    const wait = averageWaitDays(data.animals);
    const shown = animalsOf(data.animals, group);
    const counts = {
      adoption: animalsOf(data.animals, 'adoption').length,
      care: animalsOf(data.animals, 'care').length,
      adopted: animalsOf(data.animals, 'adopted').length,
    };
    const statTone = accentTone(data.theme.accent);
    const myCampaigns = (campaigns.data?.campaigns ?? [])
      .filter((item) => item.phase === 'active')
      .slice(0, MAX_CAMPAIGNS);
    const myEvents = (events.data?.events ?? [])
      .filter((item) => item.state === 'scheduled' || item.state === 'happening')
      .slice(0, MAX_EVENTS);

    body = (
      <View style={styles.sections}>
        {/* Capa na cor da ONG, com a textura de ossinho e peixinho do app. */}
        <View style={[styles.hero, { backgroundColor: tone.background }]}>
          <PetPattern color={tone.foreground} opacity={0.08} />
          <View style={styles.heroTop}>
            <View style={[styles.avatarRing, { backgroundColor: colors.surface }]}>
              <Avatar name={data.org.name} uri={data.org.avatarUrl} size="xl" verified />
            </View>
            <View style={styles.heroText}>
              <AppText variant="caption" style={{ color: tone.foreground }}>
                {data.org.role === 'ngo' ? 'ONG VERIFICADA' : 'PROTETOR VERIFICADO'}
              </AppText>
              <AppText variant="h2" style={{ color: tone.foreground }} numberOfLines={2}>
                {data.org.name}
              </AppText>
              <AppText variant="bodySmall" style={{ color: tone.foreground }} numberOfLines={1}>
                @{data.org.handle}
                {data.org.neighborhood ? ` · ${data.org.neighborhood}` : ''}
              </AppText>
            </View>
          </View>
          {data.theme.tagline ? (
            <AppText style={[styles.tagline, { color: tone.foreground }]}>
              “{data.theme.tagline}”
            </AppText>
          ) : null}
          <View style={styles.heroActions}>
            <Button
              title="Ver perfil"
              icon="user"
              variant="outline"
              onPress={() => router.push(`/user/${data.org.handle}`)}
              style={styles.grow}
            />
            {data.org.instagram ? (
              <Button
                title="Instagram"
                icon="instagram"
                variant="outline"
                onPress={() =>
                  void Linking.openURL(`https://www.instagram.com/${data.org.instagram}`)
                }
                style={styles.grow}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.cell}>
            <StatCard
              value={data.stats.newInterests}
              label="Fichas novas na semana"
              icon="inbox"
              tone={statTone}
            />
          </View>
          <View style={styles.cell}>
            <StatCard
              value={data.stats.forAdoption}
              label="Esperando família"
              icon="home"
              tone={statTone}
            />
          </View>
          <View style={styles.cell}>
            <StatCard
              value={data.stats.adoptedThisMonth}
              label="Adotados este mês"
              icon="heart"
              tone={statTone}
            />
          </View>
          <View style={styles.cell}>
            <StatCard value={waitShort(wait)} label="Espera média" icon="clock" tone={statTone} />
          </View>
        </View>
        <AppText variant="bodySmall" color="textSecondary" style={styles.totals}>
          {data.stats.rescue} em resgate · {data.stats.care} em cuidado ·{' '}
          {data.stats.adoptedTotal === 1 ? '1 adotado' : `${data.stats.adoptedTotal} adotados`}{' '}
          desde o começo
        </AppText>

        <View>
          <SectionHeader title="Fichas de adoção" subtitle="Quem quer adotar seus animais" />
          {data.recentInterests.length === 0 ? (
            <View style={styles.pad}>
              <Card elevation="none" style={{ backgroundColor: colors.surfaceMuted }}>
                <AppText color="textSecondary">
                  Ainda não chegou ficha. Quando alguém tocar em “Quero adotar”, as respostas
                  aparecem aqui.
                </AppText>
              </Card>
            </View>
          ) : (
            <View style={styles.list}>
              {data.recentInterests.map((interest) => (
                <InterestRow
                  key={`${interest.postId}:${interest.person.id}`}
                  interest={interest}
                  onPress={() => openPost(interest.postId)}
                />
              ))}
            </View>
          )}
        </View>

        <View>
          <SectionHeader title="Seus animais" />
          <View style={styles.pad}>
            <Segmented
              accessibilityLabel="Fase dos animais"
              value={group}
              onChange={setGroup}
              options={[
                { value: 'adoption', label: `Adoção ${counts.adoption}` },
                { value: 'care', label: `Cuidado ${counts.care}` },
                { value: 'adopted', label: `Adotados ${counts.adopted}` },
              ]}
            />
          </View>
          {shown.length === 0 ? (
            <View style={styles.pad}>
              <AppText color="textSecondary" style={styles.emptyLine}>
                {group === 'adoption'
                  ? 'Nenhum animal para adoção agora.'
                  : group === 'care'
                    ? 'Nenhum animal em resgate ou em cuidado.'
                    : 'Os adotados aparecem aqui.'}
              </AppText>
            </View>
          ) : (
            <View style={styles.list}>
              {shown.map((item) => (
                <AnimalRow key={item.post.id} item={item} onPress={() => openPost(item.post.id)} />
              ))}
            </View>
          )}
        </View>

        <View>
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
              <AppText color="textSecondary">Nenhuma campanha aberta.</AppText>
            ) : null}
          </View>
        </View>

        <View>
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
              <AppText color="textSecondary">Nenhum evento marcado.</AppText>
            ) : null}
          </View>
        </View>

        <View>
          <SectionHeader title="Fazer agora" />
          <View style={styles.list}>
            <ActionCard
              title="Publicar um animal"
              description="Resgate ou animal para adoção"
              icon="plus-circle"
              tone={statTone}
              onPress={() => router.push('/create')}
            />
            <ActionCard
              title="Abrir uma campanha"
              description="Ração, castração ou veterinário, com extrato aberto"
              icon="heart"
              tone={statTone}
              onPress={() => router.push('/campanha/nova')}
            />
            <ActionCard
              title="Marcar um evento"
              description="Feira de adoção, mutirão ou bazar"
              icon="calendar"
              tone={statTone}
              onPress={() => router.push('/agenda/novo')}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          allowed ? (
            <RefreshControl
              refreshing={pulling}
              onRefresh={() => void refresh()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        <View style={styles.column}>
          <Header
            title="Painel da ONG"
            subtitle={data ? `${greeting()}! Veja o que mudou.` : undefined}
            large
            onBack={() => router.back()}
            right={
              data ? (
                <IconButton
                  icon="droplet"
                  accessibilityLabel="Mudar a cor e a frase do painel"
                  onPress={() => setThemeOpen(true)}
                />
              ) : null
            }
          />
          {body}
        </View>
      </ScrollView>
      {data ? (
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
      ) : null}
    </SafeAreaView>
  );
}

/** Uma ficha: quem mandou, para qual animal, quando e as duas primeiras respostas. */
function InterestRow({ interest, onPress }: { interest: PanelInterest; onPress: () => void }) {
  const lines = answerLines(interest.answers, interest.animal.species).slice(0, 2);
  const animal =
    interest.animal.name ??
    `o ${(speciesLabel[interest.animal.species] ?? 'bichinho').toLowerCase()}`;
  return (
    <Card
      elevation="sm"
      padding="md"
      onPress={onPress}
      accessibilityLabel={`${interest.person.name} quer adotar ${animal}. ${lines.join('. ')}.`}
    >
      <View style={styles.row}>
        <Avatar
          name={interest.person.name}
          uri={interest.person.avatarUrl}
          size="md"
          verified={interest.person.verified}
        />
        <View style={styles.rowText}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {interest.person.name} quer adotar {animal}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {lines.join(' · ')}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {formatWhen(interest.updatedAt)}
          </AppText>
        </View>
        <Photo
          uri={interest.animal.photoUrl}
          style={styles.thumb}
          accessibilityLabel=""
          iconSize="sm"
        />
      </View>
      {interest.note ? (
        <AppText variant="bodySmall" style={styles.note} numberOfLines={3}>
          “{interest.note}”
        </AppText>
      ) : null}
    </Card>
  );
}

/** Um animal da ONG: foto, nome, fase, há quanto tempo espera e as fichas. */
function AnimalRow({ item, onPress }: { item: PanelAnimal; onPress: () => void }) {
  const { post } = item;
  const name = animalHeadline(post.animal);
  const waiting = post.status === 'for_adoption' ? waitingShort(post.adoptionSince) : null;
  const interests = interestLabel(item.interests, item.newInterests);
  return (
    <Card
      elevation="sm"
      padding="md"
      onPress={onPress}
      accessibilityLabel={[name, waiting, interests].filter(Boolean).join('. ')}
    >
      <View style={styles.row}>
        <Photo uri={post.media[0]?.thumbUrl} style={styles.photo} accessibilityLabel="" />
        <View style={styles.rowText}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {[placeOf(post.approxLabel), waiting].filter(Boolean).join(' · ')}
          </AppText>
          <View style={styles.pills}>
            <StatusPill status={post.status} />
            {interests ? (
              <Badge
                kind="label"
                label={interests}
                tone={item.newInterests > 0 ? 'secondary' : 'neutral'}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const PHOTO = 72;
const THUMB = 44;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  sections: { gap: spacing.lg },
  hero: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatarRing: { borderRadius: radius.pill, padding: spacing.xs },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: spacing.xs },
  tagline: { fontStyle: 'italic' },
  heroActions: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cell: { flexBasis: '47%', flexGrow: 1 },
  totals: { paddingHorizontal: spacing.lg, marginTop: -spacing.sm },
  pad: { paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  emptyLine: { paddingTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.md },
  photo: { width: PHOTO, height: PHOTO, borderRadius: radius.md },
  note: { marginTop: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
