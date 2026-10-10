import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadFeed, loadPost, messageFrom, siteUrl } from '../../src/api';
import {
  animalHeadline,
  placeOf,
  sexLabel,
  sizeLabel,
  speciesLabel,
} from '../../src/animalLabels';
import {
  AnimalCard,
  AppText,
  Avatar,
  BottomSheet,
  Button,
  Card,
  Divider,
  ErrorState,
  FavoriteButton,
  Header,
  Icon,
  IconButton,
  InfoChip,
  Input,
  ListItem,
  MarajoaraPattern,
  Notice,
  PhotoScrim,
  Skeleton,
  StatusPill,
  Touchable,
} from '../../src/components/ui';
import { AnimalDiary } from '../../src/diary';
import { formatKm, formatWhen } from '../../src/format';
import { Mascot } from '../../src/mascot';
import { useSession } from '../../src/session';
import {
  contentMaxWidth,
  motion,
  nextStatus,
  radius,
  size,
  spacing,
  statusLabel,
  useTheme,
} from '../../src/theme';
import { useLightStatusBar } from '../../src/useLightStatusBar';

interface Comment {
  id: string;
  body: string;
  author: { handle: string };
}

const reportReasons = [
  'Conteúdo abusivo',
  'Parece venda de animal',
  'Informação falsa',
  'É spam',
] as const;

const NOTE_MS = 6000;
const DOT = 8;
const DOT_ACTIVE_WIDTH = 24;
const MASCOT_ON_PHOTO = 160;
const SHARE_BUTTON = size.control + spacing.sm;

export default function PostScreen() {
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const userId = useSession((state) => state.user?.id);
  const client = useQueryClient();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [helping, setHelping] = useState(false);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const { width } = useWindowDimensions();
  const galleryHeight = Math.min(Math.round(width * 1.1), size.galleryMax);
  const footerPad = Math.max(insets.bottom, spacing.lg);
  const footerHeight = spacing.lg + SHARE_BUTTON + footerPad;
  const post = useQuery({
    queryKey: ['post', id, token],
    queryFn: () => loadPost(id, token),
    enabled: Boolean(id),
  });
  const comments = useQuery({
    queryKey: ['comments', id],
    queryFn: () => api<{ comments: Comment[] }>(`/posts/${id}/comments`, { token }),
    enabled: commentsOpen && Boolean(id),
  });
  const fosters = useQuery({
    queryKey: ['fosters', id],
    queryFn: () =>
      api<{ fosters: { id: string; name: string; distanceKm: number }[] }>(`/posts/${id}/fosters`),
    enabled: Boolean(id),
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
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setHelpOpen(false);
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
  const fosterList = fosters.data?.fosters ?? [];
  const similarPosts = (similar.data?.posts ?? []).filter((other) => other.id !== item.id);
  const forAdoption = item.status === 'for_adoption';
  const speciesName = speciesLabel[item.animal.species] ?? 'bichinho';
  const animalLines = [
    item.animal.healthNotes ? { icon: 'activity' as const, text: item.animal.healthNotes } : null,
    item.animal.temperament ? { icon: 'smile' as const, text: item.animal.temperament } : null,
  ].filter((line) => line !== null);

  function onHelpPress() {
    if (!item) return;
    if (item.viewerWillHelp) {
      setNote('Você já está neste resgate. O ponto exato continua visível para você.');
      return;
    }
    if (!token) {
      setNote('Entre na sua conta para dizer que vai ajudar.');
      return;
    }
    setHelpOpen(true);
  }

  function onAdoptPress() {
    if (!token) {
      setNote('Entre na sua conta para adotar.');
      return;
    }
    setAdoptOpen(true);
  }

  function confirmAdoption() {
    if (!item) return;
    setAdoptOpen(false);
    void act(`/posts/${item.id}/adoption-term`, 'POST', {
      body: 'Aceito cuidar do animal, manter a castração e avisar a pessoa que resgatou sobre a adaptação.',
    }).then((ok) => {
      if (ok) setNote('Termo registrado. A adoção ainda depende de vocês, fora do app.');
    });
  }

  function share() {
    if (!item) return;
    void Share.share({
      message: `${animalHeadline(item.animal)} em ${item.approxLabel} no Égua, adota! ${siteUrl}/p/${item.id}`,
      url: `${siteUrl}/p/${item.id}`,
    });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: footerHeight + spacing.xl }}
      >
        <View style={[styles.gallery, { height: galleryHeight, backgroundColor: colors.surfaceMuted }]}>
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
              <MarajoaraPattern color={colors.primary} opacity={0.12} />
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
                    { backgroundColor: index === photoIndex ? colors.onMedia : colors.onMediaMuted },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.column}>
            <View style={styles.titleBlock}>
              <AppText variant="h1">{animalHeadline(item.animal)}</AppText>
              <View style={styles.pills}>
                <StatusPill status={item.status} />
                <StatusPill urgency={item.urgency} />
              </View>
              <View style={styles.place}>
                <Icon name="map-pin" size="sm" color={colors.textSecondary} />
                <AppText variant="bodySmall" color="textSecondary" style={styles.placeText}>
                  {item.approxLabel} ·{' '}
                  {item.location.exact ? 'ponto exato' : 'ponto aproximado, cerca de 500 m'}
                </AppText>
              </View>
            </View>

            <View style={styles.chips}>
              <InfoChip label={speciesName} icon="heart" tone="primary" />
              {sizeLabel[item.animal.size] ? (
                <InfoChip label={sizeLabel[item.animal.size] ?? ''} icon="maximize-2" tone="caramel" />
              ) : null}
              {sexLabel[item.animal.sex] ? (
                <InfoChip label={sexLabel[item.animal.sex] ?? ''} icon="user" tone="secondary" />
              ) : null}
              {item.animal.ageEstimate ? (
                <InfoChip label={item.animal.ageEstimate} icon="clock" tone="info" />
              ) : null}
            </View>

            <View style={styles.section}>
              <AppText variant="h2">A história deste {speciesName.toLowerCase()}</AppText>
              <AppText>{item.description}</AppText>
              {animalLines.length > 0 ? (
                <Card padding="none" elevation="none" style={{ backgroundColor: colors.surfaceMuted }}>
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
                      <AppText variant="h3" numberOfLines={1}>
                        {item.author.name}
                      </AppText>
                      <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
                        @{item.author.handle}
                        {item.author.verified ? ' · verificado' : ''} · {formatWhen(item.createdAt)}
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
              {item.author.phone ? (
                <Card padding="none" elevation="none" style={{ backgroundColor: colors.surfaceMuted }}>
                  <ListItem title="WhatsApp" subtitle={item.author.phone} icon="message-circle" />
                </Card>
              ) : null}
            </View>

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
                {item.counts.comments === 1 ? '1 comentário' : `${item.counts.comments} comentários`}
              </AppText>
            </View>

            {forAdoption ? (
              <Button
                title={item.viewerWillHelp ? 'Você vai ajudar' : 'Eu vou ajudar'}
                icon={item.viewerWillHelp ? 'check' : 'heart'}
                variant="outline"
                fullWidth
                onPress={onHelpPress}
              />
            ) : null}
            {following ? (
              <Button
                title={`Marcar como ${statusLabel[following]}`}
                icon="arrow-right"
                iconPosition="right"
                variant="outline"
                fullWidth
                onPress={() => void act(`/posts/${item.id}/status`, 'PATCH', { status: following })}
              />
            ) : null}

            {fosterList.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="h2">Lares temporários perto</AppText>
                <Card padding="none" elevation="md">
                  {fosterList.map((foster, index) => (
                    <View key={foster.id}>
                      {index > 0 ? <Divider inset /> : null}
                      <ListItem
                        title={foster.name}
                        icon="home"
                        trailing={
                          <AppText variant="bodySmall" color="textSecondary">
                            {formatKm(foster.distanceKm)}
                          </AppText>
                        }
                      />
                    </View>
                  ))}
                </Card>
              </View>
            ) : null}

            <AnimalDiary
              post={item}
              canWrite={Boolean(token) && (userId === item.author.id || item.viewerWillHelp)}
              onPublish={async (description) => {
                if (!token) {
                  setNote('Entre na sua conta para escrever no diário.');
                  return false;
                }
                try {
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
                      media: [],
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

      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <IconButton
          icon="arrow-left"
          variant="glass"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
        />
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
          { shadowOffset: { width: 0, height: -spacing.sm }, backgroundColor: colors.surfaceRaised },
          { paddingBottom: footerPad },
        ]}
      >
        <View style={styles.footerRow}>
          <IconButton
            icon="share-2"
            variant="tonal"
            accessibilityLabel="Compartilhar"
            onPress={share}
            style={styles.share}
          />
          <View style={styles.footerCta}>
            <Button
              title={
                forAdoption ? 'Quero adotar' : item.viewerWillHelp ? 'Você vai ajudar' : 'Eu vou ajudar'
              }
              icon={forAdoption || !item.viewerWillHelp ? 'heart' : 'check'}
              variant={!forAdoption && item.viewerWillHelp ? 'outline' : 'secondary'}
              size="lg"
              fullWidth
              onPress={forAdoption ? onAdoptPress : onHelpPress}
            />
          </View>
        </View>
      </View>

      <BottomSheet visible={commentsOpen} onClose={() => setCommentsOpen(false)} title="Comentários">
        <ScrollView style={styles.commentList}>
          {comments.isError ? (
            <AppText color="textSecondary">{messageFrom(comments.error)}</AppText>
          ) : !comments.isLoading && (comments.data?.comments.length ?? 0) === 0 ? (
            <AppText color="textSecondary">Ninguém comentou ainda. Escreva o primeiro.</AppText>
          ) : null}
          {(comments.data?.comments ?? []).map((itemComment) => (
            <View key={itemComment.id} style={styles.comment}>
              <AppText>
                <AppText variant="bodyStrong">@{itemComment.author.handle}</AppText> {itemComment.body}
              </AppText>
            </View>
          ))}
        </ScrollView>
        <View style={styles.commentForm}>
          <Input
            label="Seu comentário"
            value={comment}
            onChangeText={setComment}
            placeholder="Escreva um comentário"
          />
          <Button
            title="Publicar"
            icon="send"
            disabled={comment.trim().length === 0}
            fullWidth
            onPress={() => {
              const body = comment.trim();
              if (!body) return;
              void act(`/posts/${item.id}/comments`, 'POST', { body }).then((ok) => {
                if (!ok) return;
                setComment('');
                void client.invalidateQueries({ queryKey: ['comments', id] });
              });
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={reportOpen} onClose={() => setReportOpen(false)} title="Por que você denuncia?">
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
                setNote('Denúncia enviada. A equipe analisa antes de ocultar.');
              });
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Você vai ajudar?">
        <View style={styles.help}>
          <AppText color="textSecondary">
            O ponto exato deste resgate passa a aparecer para você. O WhatsApp da pessoa só entra se ela
            autorizou o contato. O app não recebe dinheiro.
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

      <BottomSheet visible={adoptOpen} onClose={() => setAdoptOpen(false)} title="Quero adotar">
        <View style={styles.help}>
          <AppText color="textSecondary">
            Você se compromete a cuidar do animal, manter a castração e avisar quem o resgatou sobre a
            adaptação. A adoção em si combinam fora do app: o Égua, adota! nunca recebe dinheiro.
          </AppText>
          <Button
            title="Aceitar o termo e adotar"
            icon="file-text"
            variant="secondary"
            size="lg"
            fullWidth
            onPress={confirmAdoption}
          />
          <Button title="Agora não" variant="ghost" fullWidth onPress={() => setAdoptOpen(false)} />
        </View>
      </BottomSheet>
    </View>
  );
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
  place: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  placeText: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  authorLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
  commentList: { flexShrink: 1 },
  comment: { paddingVertical: spacing.sm },
  commentForm: { gap: spacing.md, paddingTop: spacing.md },
  help: { gap: spacing.lg, paddingBottom: spacing.sm },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
