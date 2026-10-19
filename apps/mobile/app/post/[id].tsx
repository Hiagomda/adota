import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, loadPost, messageFrom } from '../../src/api';
import { requestMapFocus } from '../../src/map/focusRequest';
import { animalHeadline, placeOf, sexLabel, sizeLabel, speciesLabel } from '../../src/animalLabels';
import {
  AnimalCard,
  AppText,
  Avatar,
  BottomSheet,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  ErrorState,
  FavoriteButton,
  Header,
  Icon,
  IconButton,
  InfoChip,
  Input,
  ListItem,
  PetPattern,
  Notice,
  PawBurst,
  PhotoScrim,
  Skeleton,
  StatusPill,
  Touchable,
  type ButtonVariant,
  type IconName,
} from '../../src/components/ui';
import { AnimalDiary } from '../../src/diary';
import { useWhatsAppContact } from '../../src/contact/useWhatsAppContact';
import { formatWhatsApp } from '../../src/contact/whatsapp';
import { distanceLabel, formatWhen } from '../../src/format';
import { useViewerLocation } from '../../src/place/deviceLocation';
import { uploadProfilePhoto } from '../../src/place/publish';
import { Mascot } from '../../src/mascot';
import { journeyOf } from '../../src/post/journey';
import { careChips } from '../../src/post/care';
import { firstName, notFoundVisits } from '../../src/post/diaryEntries';
import { RescueJourney } from '../../src/post/RescueJourney';
import { postLinkFor, sharePost } from '../../src/post/sharePost';
import { PostEditor } from '../../src/post/PostEditor';
import { AdoptionInterestSheet } from '../../src/post/AdoptionInterestSheet';
import {
  answerLines,
  interestMessage,
  type AdoptionAnswers,
} from '../../src/post/adoptionInterest';
import { waitingLabel } from '../../src/post/waiting';
import { isTeamRole, useSession } from '../../src/session';
import {
  contentMaxWidth,
  motion,
  nextStatus,
  radius,
  size,
  spacing,
  useTheme,
} from '../../src/theme';
import { useLightStatusBar } from '../../src/useLightStatusBar';
import { logBestEffort } from '../../src/crash/bestEffort';
import { reportError } from '../../src/crash/reporter';
import { reportReasons, reportSentNote } from '../../src/reportReasons';

/** Ficha que alguém mandou antes de chamar no WhatsApp. Só quem cuida recebe a lista. */
interface AdoptionInterest {
  person: { id: string; name: string; handle: string; avatarUrl: string | null; verified: boolean };
  answers: AdoptionAnswers;
  note: string | null;
  updatedAt: string;
}

interface Comment {
  id: string;
  body: string;
  parentHandle: string | null;
  author: { handle: string };
}

const NOTE_MS = 6000;
const DOT = 8;
const DOT_ACTIVE_WIDTH = 24;
const MASCOT_ON_PHOTO = 160;
const SHARE_BUTTON = size.control + spacing.sm;

export default function PostScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, dark, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const here = useViewerLocation();
  const user = useSession((state) => state.user);
  const userId = user?.id;
  const client = useQueryClient();
  const focused = useIsFocused();
  // Once the photo scrolls away the floating buttons would sit on top of the text.
  const [solidBar, setSolidBar] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [interestOpen, setInterestOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [helping, setHelping] = useState(false);
  const [helpBurst, setHelpBurst] = useState(0);
  const [foundOpen, setFoundOpen] = useState(false);
  const [troubleOpen, setTroubleOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [measuredFooter, setMeasuredFooter] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; handle: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const { width } = useWindowDimensions();
  const galleryHeight = Math.min(Math.round(width * 1.25), size.galleryMax);
  const solidBarAt = galleryHeight - size.sheetOverlap - insets.top - size.touch;
  useEffect(() => {
    // useLightStatusBar keeps light icons for the photo; over the solid bar they follow the theme.
    if (focused) setStatusBarStyle(solidBar && !dark ? 'dark' : 'light');
  }, [dark, focused, solidBar]);
  const footerPad = Math.max(insets.bottom, spacing.lg);
  const post = useQuery({
    queryKey: ['post', id, token],
    queryFn: () => loadPost(id, token),
    enabled: Boolean(id),
  });
  const comments = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api<{ comments: Comment[] }>(`/posts/${id}/comments`, { token }),
    enabled: Boolean(id),
  });
  const fosters = useQuery({
    // The server lists Casas Amigas only to the author, the team and who said "vou ajudar",
    // without address or distance: the meeting is arranged on WhatsApp.
    queryKey: ['foster-homes', id, token],
    queryFn: () => api<{ homes: FosterHome[] }>(`/posts/${id}/foster-homes`, { token }),
    enabled: Boolean(id && token),
  });
  const whatsapp = useWhatsAppContact(token, setNote);
  const sightings = useQuery({
    queryKey: ['sightings', id, token],
    queryFn: () => api<{ sightings: Sighting[] }>(`/posts/${id}/sightings`, { token }),
    enabled: Boolean(id),
  });
  const ownAdoption =
    Boolean(token) &&
    post.data?.author.id === userId &&
    (post.data?.status === 'for_adoption' || post.data?.status === 'adopted');
  const interests = useQuery({
    queryKey: ['adoption-interests', id, token],
    queryFn: () =>
      api<{ interests: AdoptionInterest[] }>(`/posts/${id}/adoption-interests`, { token }),
    enabled: Boolean(id) && ownAdoption,
  });
  const species = post.data?.animal.species;
  const similar = useQuery({
    queryKey: ['similar', species, token],
    queryFn: () => loadFeed(token, `?species=${species ?? ''}&limit=8`),
    enabled: Boolean(species),
  });

  // Messages are feedback, not content: they go away on their own.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(timer);
  }, [note]);

  async function act(path: string, method = 'POST', body?: unknown): Promise<boolean> {
    if (!token) {
      setNote('Entre na sua conta para continuar.');
      return false;
    }
    try {
      await api(path, { method, token, body });
      await client.invalidateQueries({ queryKey: ['post', id, token] });
      await client.invalidateQueries({ queryKey: ['posts'] });
      await client.invalidateQueries({ queryKey: ['map'] });
      return true;
    } catch (error) {
      setNote(messageFrom(error));
      return false;
    }
  }

  async function confirmHelp() {
    if (!token || helping || !post.data) return;
    setHelping(true);
    try {
      await api(`/posts/${post.data.id}/responses`, {
        method: 'POST',
        token,
        body: { kind: 'will_help' },
      });
      await client.invalidateQueries({ queryKey: ['post', id, token] });
      await client.invalidateQueries({ queryKey: ['posts'] });
      await client.invalidateQueries({ queryKey: ['map'] });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        logBestEffort('post:help-haptic'),
      );
      setHelpOpen(false);
      setHelpBurst((count) => count + 1);
      setNote(
        'Combinado. O ponto exato deste resgate fica visível para você. O WhatsApp só aparece se a pessoa autorizou.',
      );
    } catch (error) {
      setHelpOpen(false);
      setNote(messageFrom(error));
    } finally {
      setHelping(false);
    }
  }

  function onPhotoScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setPhotoIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  const item = post.data;
  if (post.isError) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <Header title="Resgate" onBack={() => router.back()} />
        <ErrorState
          title="Não encontrei este resgate"
          body={messageFrom(post.error)}
          onRetry={() => void post.refetch()}
        />
      </SafeAreaView>
    );
  }
  if (!item) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <Skeleton height={galleryHeight} radius="sm" />
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.column}>
            <Skeleton width="60%" height={36} />
            <Skeleton width="40%" height={20} />
            <Skeleton height={20} />
            <Skeleton width="80%" height={20} />
          </View>
        </View>
        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <IconButton
            icon="arrow-left"
            variant="glass"
            accessibilityLabel="Voltar"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  const following = nextStatus[item.status];
  const isAuthor = userId === item.author.id;
  const canOwn = isAuthor || isTeamRole(user?.role);
  const canMoveStatus = canOwn || item.viewerWillHelp;
  const forAdoption = item.status === 'for_adoption';
  const adopted = item.status === 'adopted';
  const adoptionContact = forAdoption || adopted;
  // The street part of the rescue: someone can still go, look, or step back.
  const rescueOpen = openRescueStatuses.has(item.status);
  const helpingNow = item.viewerWillHelp && rescueOpen;
  const helpers = item.helpersCount ?? 0;
  const othersGoing = Math.max(helpers - (item.viewerWillHelp ? 1 : 0), 0);
  const missedVisits = notFoundVisits(item);
  const careList = careChips(item.animal.care);
  const waiting = forAdoption ? waitingLabel(item.adoptionSince) : null;
  const interestList = interests.data?.interests ?? [];
  const sightingList = sightings.data?.sightings ?? [];
  const footerHeight = measuredFooter || spacing.lg + SHARE_BUTTON + footerPad;
  const fosterList = fosters.data?.homes ?? [];
  const similarPosts = (similar.data?.posts ?? []).filter((other) => other.id !== item.id);
  const speciesName = speciesLabel[item.animal.species] ?? 'bichinho';
  const animalLines = [
    item.animal.healthNotes ? { icon: 'activity' as const, text: item.animal.healthNotes } : null,
    item.animal.temperament ? { icon: 'smile' as const, text: item.animal.temperament } : null,
  ].filter((line) => line !== null);

  const rescueId = item.id;

  async function leaveRescue(outcome: 'could_not' | 'not_found') {
    if (!token || leaving) return;
    setLeaving(true);
    try {
      const result = await api<{ status: string }>(`/posts/${rescueId}/help/leave`, {
        method: 'POST',
        token,
        body: { outcome },
      });
      await client.invalidateQueries({ queryKey: ['post', id, token] });
      await client.invalidateQueries({ queryKey: ['posts'] });
      await client.invalidateQueries({ queryKey: ['map'] });
      if (outcome === 'could_not' && result.status === 'open') {
        setNote('Você saiu. O resgate voltou para Aberto.');
      } else if (outcome === 'could_not') {
        setNote('Você saiu deste resgate.');
      } else if (result.status === 'not_found') {
        setNote('Marquei que o animal não foi encontrado.');
      } else {
        setNote('Anotei que você não encontrou. Outra pessoa ainda está a caminho.');
      }
    } catch (error) {
      setNote(messageFrom(error));
    } finally {
      setLeaving(false);
    }
  }

  async function markFound() {
    if (marking) return;
    setMarking(true);
    const ok = await act(`/posts/${rescueId}/status`, 'PATCH', { status: 'rescued' });
    setMarking(false);
    setFoundOpen(false);
    if (!ok) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      logBestEffort('post:found-haptic'),
    );
    setHelpBurst((count) => count + 1);
    setNote('Égua, que alegria! Conte no diário como ele está.');
  }

  function stepBack(outcome: 'could_not' | 'not_found') {
    setTroubleOpen(false);
    void leaveRescue(outcome);
  }

  function onHelpPress() {
    if (!item) return;
    if (item.viewerWillHelp) return;
    if (!token) {
      setNote('Entre na sua conta para dizer que vai ajudar.');
      return;
    }
    setHelpOpen(true);
  }

  const contactBusy = whatsapp.busy === `/posts/${item.id}/contact`;
  const cta: FooterAction =
    adoptionContact && isAuthor
      ? {
          title: forAdoption ? 'Compartilhar para achar um lar' : 'Compartilhar',
          icon: 'share-2',
          variant: 'secondary',
          onPress: share,
          share: true,
        }
      : adoptionContact
        ? {
            title: forAdoption ? 'Quero adotar' : 'Falar no WhatsApp',
            icon: 'message-circle',
            variant: 'secondary',
            loading: contactBusy,
            onPress: () => (forAdoption ? startAdoption() : talkToAuthor()),
          }
        : helpingNow
          ? {
              title: 'Encontrei o animal',
              icon: 'check',
              variant: 'secondary',
              onPress: () => setFoundOpen(true),
            }
          : rescueOpen
            ? {
                title: item.status === 'not_found' ? 'Vou procurar' : 'Eu vou ajudar',
                icon: item.status === 'not_found' ? 'search' : 'heart',
                variant: 'secondary',
                onPress: onHelpPress,
              }
            : canMoveStatus && following && nextStepAction[following]
              ? {
                  title: nextStepAction[following] ?? '',
                  icon: 'arrow-right',
                  variant: 'primary',
                  onPress: () =>
                    void act(`/posts/${item.id}/status`, 'PATCH', { status: following }),
                }
              : {
                  title: 'Compartilhar',
                  icon: 'share-2',
                  variant: 'primary',
                  onPress: share,
                  share: true,
                };
  const footerLine = helpingNow
    ? othersGoing > 0
      ? `Você e mais ${othersGoing} a caminho · ponto exato liberado`
      : 'Você está a caminho · ponto exato liberado'
    : rescueOpen && helpers > 0
      ? `${helpers} ${helpers === 1 ? 'pessoa' : 'pessoas'} a caminho`
      : null;

  const postLink = postLinkFor(item.id);
  // "a Mel" reads wrong without knowing the sex, so the name goes alone or "um gato".
  const animalRef = item.animal.name?.trim() || `um ${speciesName.toLowerCase()}`;
  const authorFirstName = item.author.name.split(' ')[0] ?? item.author.name;

  function talkToAuthor() {
    if (!item) return;
    const text = adoptionContact
      ? `Oi, ${authorFirstName}! Vi o post de adoção de ${animalRef} no Égua, adota! e quero adotar. ${postLink}`
      : `Oi, ${authorFirstName}! Vou ajudar no resgate de ${animalRef} em ${placeOf(item.approxLabel)}, pelo Égua, adota!. ${postLink}`;
    void whatsapp.open(`/posts/${item.id}/contact`, text);
  }

  function startAdoption() {
    if (!token) {
      setNote('Entre na sua conta para falar com quem cuida.');
      return;
    }
    setInterestOpen(true);
  }

  function sendInterest(answers: AdoptionAnswers, extra: string) {
    if (!item) return;
    setInterestOpen(false);
    void whatsapp.open(
      `/posts/${item.id}/contact`,
      interestMessage({
        authorFirstName,
        animalRef,
        answers,
        species: item.animal.species,
        note: extra,
        link: postLink,
      }),
    );
  }

  function talkToFosterHome(home: FosterHome) {
    if (!item) return;
    const first = home.name.split(' ')[0] ?? home.name;
    void whatsapp.open(
      `/posts/${item.id}/foster-homes/${home.id}/contact`,
      `Oi, ${first}! Vi que você oferece Casa Amiga no Égua, adota!. Tem ${animalRef} precisando de lar temporário em ${placeOf(item.approxLabel)}. ${postLink}`,
    );
  }

  function share() {
    if (!item) return;
    sharePost(item).catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'post:share' });
      setNote('Não consegui abrir o compartilhamento. Tente de novo.');
    });
  }

  const away = distanceLabel(here, item.location);
  const placeLine = away ? `${item.approxLabel} · ${away}` : item.approxLabel;
  const placePrecision = item.location.exact ? 'Ponto exato' : 'Ponto aproximado, cerca de 500 m';

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const next = event.nativeEvent.contentOffset.y > solidBarAt;
          setSolidBar((current) => (current === next ? current : next));
        }}
        contentContainerStyle={{ paddingBottom: footerHeight + spacing.xl }}
      >
        <View
          style={[styles.gallery, { height: galleryHeight, backgroundColor: colors.surfaceMuted }]}
        >
          {item.media.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPhotoScroll}
            >
              {item.media.map((media, index) => (
                <Image
                  key={media.url}
                  source={{ uri: media.url }}
                  style={{ width, height: galleryHeight }}
                  contentFit="cover"
                  transition={motion.base}
                  cachePolicy="memory-disk"
                  accessibilityLabel={`Foto ${index + 1} de ${item.media.length} do animal`}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.photoEmpty}>
              <PetPattern color={colors.primary} opacity={0.12} />
              <Mascot pose="search" size={MASCOT_ON_PHOTO} />
              <AppText color="textSecondary">Ainda sem foto deste bichinho</AppText>
            </View>
          )}
          <PhotoScrim edge="top" stop={0.72} />
          {item.media.length > 1 ? (
            <View
              accessible
              accessibilityLabel={`Foto ${photoIndex + 1} de ${item.media.length}`}
              style={styles.dots}
            >
              {item.media.map((media, index) => (
                <View
                  key={media.url}
                  style={[
                    styles.dot,
                    index === photoIndex ? styles.dotActive : null,
                    {
                      backgroundColor: index === photoIndex ? colors.onMedia : colors.onMediaMuted,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.column}>
            <View style={styles.titleBlock}>
              <AppText variant="display">{animalHeadline(item.animal)}</AppText>
              <View style={styles.pills}>
                {journeyOf(item.type, item.status) ? null : <StatusPill status={item.status} />}
                {/* Urgency only matters while nobody has the animal yet. */}
                {item.status === 'open' ? <StatusPill urgency={item.urgency} /> : null}
              </View>
            </View>

            <RescueJourney type={item.type} status={item.status} />

            {item.status === 'not_found' ? (
              <View
                accessibilityRole="summary"
                style={[styles.missed, { backgroundColor: colors.warningSoft }]}
              >
                <Icon name="search" color={colors.onWarningSoft} />
                <View style={styles.missedText}>
                  <AppText variant="bodyStrong" style={{ color: colors.onWarningSoft }}>
                    Não foi encontrado na última busca
                  </AppText>
                  <AppText variant="bodySmall" style={{ color: colors.onWarningSoft }}>
                    {missedVisits > 1
                      ? `${missedVisits} pessoas foram até o local e não acharam.`
                      : 'Alguém foi até o local e não achou.'}{' '}
                    Animal de rua costuma voltar ao mesmo canto: se passar por perto, dê uma olhada.
                  </AppText>
                </View>
              </View>
            ) : null}

            {/* One coral action per screen: the place is a quiet row, the footer keeps the CTA. */}
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={`Ver no mapa. ${placeLine}. ${placePrecision}`}
              pressedScale={0.98}
              onPress={() => {
                requestMapFocus({
                  postId: item.id,
                  latitude: item.location.latitude,
                  longitude: item.location.longitude,
                });
                router.navigate('/explore');
              }}
              style={[styles.place, { backgroundColor: colors.surfaceMuted }]}
            >
              <View style={[styles.placeIcon, { backgroundColor: colors.primarySoft }]}>
                <Icon name="map-pin" size="md" color={colors.onPrimarySoft} />
              </View>
              <View style={styles.placeText}>
                <AppText variant="bodySmallStrong" numberOfLines={2}>
                  {placeLine}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {placePrecision}
                </AppText>
              </View>
              <Icon name="chevron-right" size="md" color={colors.primary} />
            </Touchable>

            <View style={styles.chips}>
              <InfoChip label={speciesName} icon="heart" tone="primary" />
              {sizeLabel[item.animal.size] ? (
                <InfoChip
                  label={sizeLabel[item.animal.size] ?? ''}
                  icon="maximize-2"
                  tone="caramel"
                />
              ) : null}
              {sexLabel[item.animal.sex] ? (
                <InfoChip label={sexLabel[item.animal.sex] ?? ''} icon="user" tone="secondary" />
              ) : null}
              {item.animal.ageEstimate ? (
                <InfoChip label={item.animal.ageEstimate} icon="clock" tone="info" />
              ) : null}
              {waiting ? <InfoChip label={waiting} icon="calendar" tone="caramel" /> : null}
            </View>

            {careList.length > 0 ? (
              <View style={styles.chips} accessibilityRole="list">
                {careList.map((chip) => (
                  <InfoChip
                    key={chip.key}
                    label={chip.label}
                    icon={chip.yes ? 'check' : 'minus'}
                    tone={chip.yes ? 'success' : 'neutral'}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <AppText variant="h2">
                {item.type === 'adoption' ? 'Sobre o animal' : 'O que aconteceu'}
              </AppText>
              <AppText>{item.description}</AppText>
              {animalLines.length > 0 ? (
                <Card
                  padding="none"
                  elevation="none"
                  style={{ backgroundColor: colors.surfaceMuted }}
                >
                  {animalLines.map((line, index) => (
                    <View key={line.text}>
                      {index > 0 ? <Divider inset /> : null}
                      <ListItem title={line.text} icon={line.icon} />
                    </View>
                  ))}
                </Card>
              ) : null}
            </View>

            <View style={styles.section}>
              <AppText variant="h2">Quem está cuidando</AppText>
              <Card elevation="md" padding="md">
                <View style={styles.author}>
                  <Touchable
                    accessibilityRole="button"
                    accessibilityLabel={`Ver perfil de @${item.author.handle}`}
                    pressedScale={0.98}
                    onPress={() => router.push(`/user/${item.author.handle}`)}
                    style={styles.authorLink}
                  >
                    <Avatar
                      name={item.author.name}
                      uri={item.author.avatarUrl}
                      size="lg"
                      verified={item.author.verified}
                    />
                    <View style={styles.authorText}>
                      <AppText variant="h3" numberOfLines={2}>
                        {item.author.name}
                      </AppText>
                      <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
                        @{item.author.handle}
                      </AppText>
                      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                        {item.author.verified ? 'Perfil verificado · publicou ' : 'Publicou '}
                        {formatWhen(item.createdAt)}
                      </AppText>
                    </View>
                  </Touchable>
                  <Button
                    title="Seguir"
                    variant="outline"
                    onPress={() => void act(`/users/${item.author.id}/follow`)}
                  />
                </View>
              </Card>
              {item.author.phone && !adoptionContact ? (
                <Card
                  padding="none"
                  elevation="none"
                  style={{ backgroundColor: colors.surfaceMuted }}
                >
                  <ListItem
                    title="Falar no WhatsApp"
                    subtitle={formatWhatsApp(item.author.phone)}
                    icon="message-circle"
                    showChevron
                    onPress={talkToAuthor}
                  />
                </Card>
              ) : null}
            </View>

            {ownAdoption ? (
              <View style={styles.section}>
                <AppText variant="h2">Quem quer adotar</AppText>
                {interestList.length === 0 ? (
                  <AppText color="textSecondary">
                    {interests.isError
                      ? messageFrom(interests.error)
                      : 'Quando alguém tocar em "Quero adotar", a ficha dessa pessoa aparece aqui e a conversa abre no seu WhatsApp.'}
                  </AppText>
                ) : (
                  <Card padding="none" elevation="md">
                    {interestList.map((interest, index) => (
                      <View key={interest.person.id}>
                        {index > 0 ? <Divider inset /> : null}
                        <Touchable
                          accessibilityRole="button"
                          accessibilityLabel={`Ficha de ${interest.person.name}. Ver perfil`}
                          pressedScale={0.98}
                          onPress={() => router.push(`/user/${interest.person.handle}`)}
                          style={styles.interest}
                        >
                          <Avatar
                            name={interest.person.name}
                            uri={interest.person.avatarUrl}
                            size="md"
                            verified={interest.person.verified}
                          />
                          <View style={styles.interestText}>
                            <AppText variant="bodyStrong" numberOfLines={1}>
                              {interest.person.name}
                            </AppText>
                            <AppText variant="bodySmall" color="textSecondary">
                              {answerLines(interest.answers, item.animal.species).join(' · ')}
                            </AppText>
                            {interest.note ? (
                              <AppText variant="bodySmall">{interest.note}</AppText>
                            ) : null}
                            <AppText variant="caption" color="textSecondary">
                              Mandou a ficha {formatWhen(interest.updatedAt)}
                            </AppText>
                          </View>
                        </Touchable>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            ) : null}

            {item.helpRequest ? (
              <Card elevation="none" style={{ backgroundColor: colors.infoSoft }}>
                <View style={styles.pix}>
                  <Icon name="heart" color={colors.onInfoSoft} />
                  <View style={styles.pixText}>
                    <AppText variant="bodyStrong" style={{ color: colors.onInfoSoft }}>
                      Pix: {item.helpRequest.pixKey ?? 'não informado'}
                    </AppText>
                    <AppText variant="bodySmall" style={{ color: colors.onInfoSoft }}>
                      {item.helpRequest.paymentNotice}
                    </AppText>
                  </View>
                </View>
              </Card>
            ) : null}

            <View style={styles.actions}>
              <IconButton
                icon="message-circle"
                accessibilityLabel={`Comentários. ${item.counts.comments} comentários`}
                onPress={() => setCommentsOpen(true)}
              />
              <IconButton
                icon="bookmark"
                variant={item.saved ? 'tonal' : 'ghost'}
                accessibilityLabel={item.saved ? 'Remover dos salvos' : 'Salvar'}
                onPress={() => void act(`/posts/${item.id}/save`)}
              />
              <IconButton
                icon="bell"
                accessibilityLabel="Acompanhar resgate"
                onPress={() => void act(`/posts/${item.id}/follow`)}
              />
              <View style={styles.spacer} />
              <AppText variant="bodySmall" color="textSecondary">
                {item.counts.likes === 1 ? '1 curtida' : `${item.counts.likes} curtidas`} ·{' '}
                {item.counts.comments === 1
                  ? '1 comentário'
                  : `${item.counts.comments} comentários`}
              </AppText>
            </View>

            {canOwn && !item.viewerWillHelp && item.status === 'on_the_way' ? (
              <Button
                title="O animal já está seguro"
                icon="check"
                variant="outline"
                fullWidth
                onPress={() => setFoundOpen(true)}
              />
            ) : null}
            {canOwn && (item.status === 'on_the_way' || item.status === 'not_found') ? (
              <Button
                title="Voltar para aberto"
                icon="rotate-ccw"
                variant="ghost"
                fullWidth
                onPress={() => void act(`/posts/${item.id}/status`, 'PATCH', { status: 'open' })}
              />
            ) : null}

            {fosterList.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="h2">Casas Amigas</AppText>
                <AppText color="textSecondary">
                  Combine pelo WhatsApp. Encontro e endereço vocês acertam por lá.
                </AppText>
                <Card padding="none" elevation="md">
                  {fosterList.map((home, index) => (
                    <View key={home.id}>
                      {index > 0 ? <Divider inset /> : null}
                      <ListItem
                        title={home.name}
                        subtitle={
                          home.maxDays ? `Acolhe por até ${home.maxDays} dias` : 'Lar temporário'
                        }
                        icon="home"
                        showChevron
                        onPress={() => talkToFosterHome(home)}
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            {rescueOpen || sightingList.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="h2">Visto por aí</AppText>
                {sightingList.length === 0 ? (
                  <AppText color="textSecondary">
                    Viu este animal em outro lugar? Marque onde, mesmo sem poder ir. Quem está
                    cuidando recebe o aviso.
                  </AppText>
                ) : (
                  <Card padding="none" elevation="md">
                    {sightingList.map((seen, index) => (
                      <View key={seen.id}>
                        {index > 0 ? <Divider inset /> : null}
                        <ListItem
                          title={`${firstName(seen.author.name)} viu em ${seen.label ?? 'um ponto perto daqui'}`}
                          subtitle={[formatWhen(seen.createdAt), seen.note]
                            .filter(Boolean)
                            .join(' · ')}
                          icon="eye"
                          showChevron
                          onPress={() => {
                            requestMapFocus({
                              postId: item.id,
                              latitude: seen.location.latitude,
                              longitude: seen.location.longitude,
                            });
                            router.navigate('/explore');
                          }}
                        />
                      </View>
                    ))}
                  </Card>
                )}
                {rescueOpen ? (
                  <Button
                    title="Vi esse animal"
                    icon="eye"
                    variant="outline"
                    fullWidth
                    onPress={() => router.push(`/sighting/${item.id}`)}
                  />
                ) : null}
              </View>
            ) : null}

            <AnimalDiary
              post={item}
              canWrite={Boolean(token) && (userId === item.author.id || item.viewerWillHelp)}
              adopted={item.status === 'adopted'}
              onPublish={async (description, photoUri) => {
                if (!token) {
                  setNote('Entre na sua conta para escrever no diário.');
                  return false;
                }
                try {
                  const photoKey = photoUri ? await uploadProfilePhoto(token, photoUri) : null;
                  const created = await api<{ reviewStatus: string }>('/posts', {
                    method: 'POST',
                    token,
                    body: {
                      type: 'update',
                      species: item.animal.species,
                      size: item.animal.size,
                      urgency: 'low',
                      description,
                      latitude: item.location.latitude,
                      longitude: item.location.longitude,
                      approxLabel: item.approxLabel,
                      parentPostId: item.id,
                      media: photoKey ? [{ url: photoKey }] : [],
                    },
                  });
                  await client.invalidateQueries({ queryKey: ['post', id, token] });
                  setNote(
                    created.reviewStatus === 'published'
                      ? 'Nota publicada no diário. Quem acompanha este resgate recebe o aviso.'
                      : 'Essa nota foi para análise antes de aparecer no diário.',
                  );
                  return created.reviewStatus === 'published';
                } catch (error) {
                  setNote(messageFrom(error));
                  return false;
                }
              }}
            />

            <View style={styles.section}>
              <AppText variant="h2">Conversa</AppText>
              <AppText color="textSecondary">
                Perguntas e recados de quem acompanha. As novidades do animal ficam no diário.
              </AppText>
              {(comments.data?.comments.length ?? 0) === 0 ? (
                <AppText color="textSecondary">Ninguém comentou ainda. Escreva o primeiro.</AppText>
              ) : (
                (comments.data?.comments ?? []).map((itemComment) => (
                  <Touchable
                    key={itemComment.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Responder comentário de @${itemComment.author.handle}`}
                    onPress={() => {
                      setReplyTo({ id: itemComment.id, handle: itemComment.author.handle });
                      setCommentsOpen(true);
                    }}
                  >
                    <AppText>
                      <AppText variant="bodyStrong">@{itemComment.author.handle}</AppText>
                      {itemComment.parentHandle ? ` para @${itemComment.parentHandle}` : ''}{' '}
                      {itemComment.body}
                    </AppText>
                  </Touchable>
                ))
              )}
              <Button
                title="Comentar"
                icon="message-circle"
                variant="outline"
                fullWidth
                onPress={() => setCommentsOpen(true)}
              />
            </View>

            {similarPosts.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="h2">Animais parecidos</AppText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bleed}
                  contentContainerStyle={styles.rail}
                >
                  {similarPosts.map((other, index) => (
                    <AnimalCard
                      key={other.id}
                      variant="compact"
                      index={index}
                      photoUri={other.media[0]?.thumbUrl ?? other.media[0]?.url}
                      title={animalHeadline(other.animal)}
                      subtitle={placeOf(other.approxLabel)}
                      status={other.status}
                      onPress={() => router.push(`/post/${other.id}`)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.secondaryActions}>
              {canOwn ? (
                <Button
                  title="Editar"
                  icon="edit-2"
                  variant="ghost"
                  onPress={() => {
                    setEditSession((value) => value + 1);
                    setEditOpen(true);
                  }}
                />
              ) : null}
              {canOwn ? (
                <Button
                  title="Excluir"
                  icon="trash-2"
                  variant="ghost"
                  onPress={() => setDeleteOpen(true)}
                />
              ) : null}
              <Button
                title="Denunciar"
                icon="flag"
                variant="ghost"
                onPress={() => setReportOpen(true)}
              />
              <Button
                title="Bloquear"
                icon="slash"
                variant="ghost"
                onPress={() => {
                  void act(`/users/${item.author.id}/block`).then((ok) => {
                    if (ok) router.back();
                  });
                }}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {note ? (
        <View
          pointerEvents="none"
          style={[
            styles.note,
            shadows.md,
            { bottom: footerHeight + spacing.md, backgroundColor: colors.surfaceRaised },
          ]}
        >
          <Notice message={note} />
        </View>
      ) : null}

      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + spacing.sm },
          solidBar ? [shadows.sm, { backgroundColor: colors.surfaceRaised }] : null,
        ]}
        pointerEvents="box-none"
      >
        <IconButton
          icon="arrow-left"
          variant={solidBar ? 'ghost' : 'glass'}
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
        />
        {solidBar ? (
          <AppText variant="h3" numberOfLines={1} style={styles.topTitle}>
            {animalHeadline(item.animal)}
          </AppText>
        ) : null}
        <FavoriteButton
          active={item.liked}
          accessibilityLabel={`${item.liked ? 'Descurtir' : 'Curtir'}. ${item.counts.likes} curtidas`}
          onPress={() => void act(`/posts/${item.id}/like`)}
        />
      </View>

      <View
        style={[
          styles.footer,
          shadows.lg,
          // The shadow of the footer goes up, over the content.
          {
            shadowOffset: { width: 0, height: -spacing.sm },
            backgroundColor: colors.surfaceRaised,
          },
          { paddingBottom: footerPad },
        ]}
        onLayout={(event) => setMeasuredFooter(event.nativeEvent.layout.height)}
      >
        {footerLine ? (
          <View style={styles.footerLine} accessibilityLiveRegion="polite">
            <View
              style={[
                styles.footerDot,
                { backgroundColor: helpingNow ? colors.success : colors.secondary },
              ]}
            />
            <AppText variant="bodySmallStrong" color="textSecondary" style={styles.footerLineText}>
              {footerLine}
            </AppText>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          {cta.share ? null : (
            <IconButton
              icon="share-2"
              variant="tonal"
              accessibilityLabel="Compartilhar"
              onPress={share}
              style={styles.share}
            />
          )}
          <View style={styles.footerCta}>
            <Button
              title={cta.title}
              icon={cta.icon}
              variant={cta.variant}
              size="lg"
              fullWidth
              loading={cta.loading}
              onPress={cta.onPress}
            />
            <PawBurst trigger={helpBurst} />
          </View>
        </View>
        {helpingNow ? (
          <Button
            title="Não deu certo?"
            variant="ghost"
            fullWidth
            disabled={leaving}
            loading={leaving}
            onPress={() => setTroubleOpen(true)}
            style={styles.leaveSecond}
          />
        ) : null}
      </View>

      <AdoptionInterestSheet
        visible={interestOpen}
        postId={item.id}
        species={item.animal.species}
        token={token}
        onClose={() => setInterestOpen(false)}
        onSent={sendInterest}
      />
      <PostEditor
        key={editSession}
        visible={editOpen}
        token={token ?? ''}
        description={item.description}
        name={item.animal.name ?? ''}
        urgency={item.urgency}
        ageEstimate={item.animal.ageEstimate}
        care={item.animal.care}
        photos={item.media.flatMap((photo) =>
          photo.storageKey ? [{ key: photo.storageKey, preview: photo.thumbUrl }] : [],
        )}
        onClose={() => setEditOpen(false)}
        onSave={async (body) => {
          if (!token) {
            setNote('Entre na sua conta para editar.');
            return;
          }
          await api(`/posts/${item.id}`, { method: 'PATCH', token, body });
          await client.invalidateQueries({ queryKey: ['post', id, token] });
          await client.invalidateQueries({ queryKey: ['posts'] });
          await client.invalidateQueries({ queryKey: ['map'] });
          setEditOpen(false);
          setNote('Resgate atualizado.');
        }}
      />
      <ConfirmDialog
        visible={deleteOpen}
        title="Excluir este resgate?"
        message="Ele sai do feed, do mapa e dos detalhes. Essa ação não apaga sua conta."
        confirmLabel="Excluir"
        destructive
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          void act(`/posts/${item.id}`, 'DELETE').then((ok) => {
            if (ok) router.back();
          });
        }}
      />

      <BottomSheet
        visible={commentsOpen}
        onClose={() => {
          setCommentsOpen(false);
          setReplyTo(null);
        }}
        title="Comentários"
      >
        <ScrollView style={styles.commentList}>
          {comments.isError ? (
            <AppText color="textSecondary">{messageFrom(comments.error)}</AppText>
          ) : !comments.isLoading && (comments.data?.comments.length ?? 0) === 0 ? (
            <AppText color="textSecondary">Ninguém comentou ainda. Escreva o primeiro.</AppText>
          ) : null}
          {(comments.data?.comments ?? []).map((itemComment) => (
            <Touchable
              key={itemComment.id}
              accessibilityRole="button"
              accessibilityLabel={`Responder @${itemComment.author.handle}`}
              onPress={() => setReplyTo({ id: itemComment.id, handle: itemComment.author.handle })}
              style={styles.comment}
            >
              <AppText>
                <AppText variant="bodyStrong">@{itemComment.author.handle}</AppText>
                {itemComment.parentHandle ? ` para @${itemComment.parentHandle}` : ''}{' '}
                {itemComment.body}
              </AppText>
            </Touchable>
          ))}
        </ScrollView>
        <View style={styles.commentForm}>
          {replyTo ? (
            <AppText color="textSecondary">
              Respondendo @{replyTo.handle}. Toque de novo num comentário para mudar.
            </AppText>
          ) : null}
          <Input
            label="Seu comentário"
            value={comment}
            onChangeText={setComment}
            placeholder={replyTo ? `Responder @${replyTo.handle}` : 'Escreva um comentário'}
          />
          <Button
            title={replyTo ? 'Responder' : 'Publicar'}
            icon="send"
            disabled={comment.trim().length === 0}
            fullWidth
            onPress={() => {
              const body = comment.trim();
              if (!body) return;
              void act(`/posts/${item.id}/comments`, 'POST', {
                body,
                parentCommentId: replyTo?.id,
              }).then((ok) => {
                if (!ok) return;
                setComment('');
                setReplyTo(null);
                void client.invalidateQueries({ queryKey: ['comments', id] });
                void client.invalidateQueries({ queryKey: ['post', id, token] });
              });
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Por que você denuncia?"
      >
        {reportReasons.map((reason) => (
          <ListItem
            key={reason}
            title={reason}
            icon="flag"
            showChevron
            onPress={() => {
              void act('/reports', 'POST', {
                targetType: 'post',
                targetId: item.id,
                reason,
              }).then((ok) => {
                if (!ok) return;
                setReportOpen(false);
                setNote(reportSentNote);
              });
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Você vai ajudar?">
        <View style={styles.help}>
          <AppText color="textSecondary">
            O ponto exato deste resgate passa a aparecer para você. Quando chegar lá, conte aqui se
            encontrou o animal. O app não recebe dinheiro.
          </AppText>
          <Button
            title={helping ? 'Confirmando...' : 'Confirmar, eu vou ajudar'}
            variant="secondary"
            size="lg"
            loading={helping}
            fullWidth
            onPress={() => void confirmHelp()}
          />
          <Button title="Agora não" variant="ghost" fullWidth onPress={() => setHelpOpen(false)} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={foundOpen}
        onClose={() => setFoundOpen(false)}
        title="Você está com o animal?"
      >
        <View style={styles.help}>
          <AppText color="textSecondary">
            O resgate passa para Resgatado e quem acompanha recebe o aviso. Depois conte no diário
            como ele está.
          </AppText>
          <Button
            title="Sim, está comigo"
            icon="check"
            variant="secondary"
            size="lg"
            loading={marking}
            fullWidth
            onPress={() => void markFound()}
          />
          <Button title="Ainda não" variant="ghost" fullWidth onPress={() => setFoundOpen(false)} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={troubleOpen}
        onClose={() => setTroubleOpen(false)}
        title="O que aconteceu?"
      >
        <View style={styles.help}>
          <OutcomeOption
            icon="search"
            title="Fui e não encontrei"
            body={
              othersGoing > 0
                ? 'Fica no diário. Quem ainda está indo continua a busca.'
                : 'Fica no diário, e o resgate aparece como Não encontrado para outra pessoa tentar.'
            }
            onPress={() => stepBack('not_found')}
          />
          <OutcomeOption
            icon="x-circle"
            title="Não vou conseguir ir"
            body={
              othersGoing > 0
                ? 'Você sai do resgate. Quem ainda está indo continua.'
                : 'Você sai, e o resgate volta para Aberto para outra pessoa ir.'
            }
            onPress={() => stepBack('could_not')}
          />
          <Button title="Voltar" variant="ghost" fullWidth onPress={() => setTroubleOpen(false)} />
        </View>
      </BottomSheet>
    </View>
  );
}

/** The street part of a rescue, while someone can still go and look. */
const openRescueStatuses = new Set(['open', 'on_the_way', 'not_found']);

/** The footer's single action once the animal is safe, said as what happens next. */
const nextStepAction: Record<string, string | undefined> = {
  fostered: 'Foi para um lar temporário',
  for_adoption: 'Colocar para adoção',
};

interface FooterAction {
  title: string;
  icon: IconName;
  variant: ButtonVariant;
  onPress: () => void;
  loading?: boolean;
  /** The action already shares, so the separate share button would repeat it. */
  share?: boolean;
}

/** One answer in "O que aconteceu?": what it is and what it does to the rescue. */
function OutcomeOption({
  icon,
  title,
  body,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      haptic="light"
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name={icon} color={colors.text} />
      </View>
      <View style={styles.optionText}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="bodySmall" color="textSecondary">
          {body}
        </AppText>
      </View>
      <Icon name="chevron-right" color={colors.textSecondary} />
    </Touchable>
  );
}

interface Sighting {
  id: string;
  label: string | null;
  note: string | null;
  createdAt: string;
  author: { name: string; handle: string };
  location: { latitude: number; longitude: number; exact: boolean };
}

interface FosterHome {
  id: string;
  name: string;
  maxDays: number | null;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gallery: { width: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  dots: {
    position: 'absolute',
    bottom: size.sheetOverlap + spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
  dotActive: { width: DOT_ACTIVE_WIDTH },
  // The white sheet climbs over the photo.
  sheet: {
    marginTop: -size.sheetOverlap,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    minHeight: size.galleryMax,
  },
  column: { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', gap: spacing.xl },
  titleBlock: { gap: spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: size.touch,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  placeIcon: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  authorLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  interest: { flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  interestText: { flex: 1, gap: spacing.xs },
  authorText: { flex: 1 },
  pix: { flexDirection: 'row', gap: spacing.md },
  pixText: { flex: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
  bleed: { marginHorizontal: -spacing.lg },
  rail: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  topTitle: { flex: 1 },
  note: { position: 'absolute', left: spacing.lg, right: spacing.lg, borderRadius: radius.md },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  footerRow: {
    width: '100%',
    maxWidth: contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  share: { width: SHARE_BUTTON, height: SHARE_BUTTON },
  footerCta: { flex: 1 },
  leaveSecond: { marginTop: spacing.xs },
  footerLine: {
    width: '100%',
    maxWidth: contentMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  footerDot: { width: 8, height: 8, borderRadius: radius.pill },
  footerLineText: { flex: 1 },
  missed: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  missedText: { flex: 1, gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  optionIcon: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, gap: spacing.xs },
  commentList: { flexShrink: 1 },
  comment: { paddingVertical: spacing.sm },
  commentForm: { gap: spacing.md, paddingTop: spacing.md },
  help: { gap: spacing.lg, paddingBottom: spacing.sm },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
