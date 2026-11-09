import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { animalHeadline } from '../../src/animalLabels';
import { api, loadPost, messageFrom } from '../../src/api';
import {
  adopterStarters,
  chatNoticePoints,
  chatReportReasons,
  lastLine,
} from '../../src/chat/chatRules';
import {
  AppText,
  Avatar,
  BottomSheet,
  Button,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  Input,
  ListItem,
  Notice,
  SkeletonRows,
  Touchable,
} from '../../src/components/ui';
import { Mascot } from '../../src/mascot';
import { reportSentNote } from '../../src/reportReasons';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, statusLabel, useTheme } from '../../src/theme';

const THUMB = 44;
const EMPTY_MASCOT = 96;

interface ChatPerson {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
}

interface ChatThread {
  id: string;
  adopterId: string;
  lastBody: string | null;
  lastAt: string | null;
  closed?: boolean;
  other: ChatPerson;
}

interface ChatList {
  role: 'author' | 'adopter';
  canStart: boolean;
  noticeAccepted?: boolean;
  other: ChatPerson | null;
  threads: ChatThread[];
}

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  removed?: boolean;
}

interface ChatPage {
  threadId?: string | null;
  closed?: boolean;
  other: ChatPerson;
  messages: ChatMessage[];
  nextCursor: string | null;
}

interface SentMessage {
  flagged?: boolean;
  tip?: string | null;
}

type Note = { message: string; tone: 'info' | 'success' | 'warning' | 'error' };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function whenLabel(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Conversa de adoção dentro do app, com o telefone oculto. É monitorada: antes da primeira
 * mensagem a pessoa lê e aceita o aviso, e uma faixa no topo lembra disso o tempo todo.
 */
export default function AdoptionChatScreen() {
  const params = useLocalSearchParams<{ postId: string; with?: string }>();
  const postId = one(params.postId);
  const openedWith = one(params.with);
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [picked, setPicked] = useState<string | null>(openedWith ?? null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const post = useQuery({
    queryKey: ['post', postId, token],
    enabled: Boolean(postId),
    queryFn: () => loadPost(postId ?? '', token),
  });

  const list = useQuery({
    queryKey: ['adoption-chat', postId, token],
    enabled: Boolean(token && postId),
    queryFn: () => api<ChatList>(`/posts/${postId}/adoption-chats`, { token }),
    refetchInterval: picked ? false : 8000,
  });

  const role = list.data?.role;
  const noticeAccepted = list.data?.noticeAccepted !== false;
  const activeAdopterId = role === 'author' ? picked : role === 'adopter' ? 'self' : null;
  const canTalk =
    role === 'adopter'
      ? Boolean(list.data && (list.data.canStart || list.data.threads.length > 0))
      : Boolean(picked);

  const messages = useQuery({
    queryKey: ['adoption-messages', postId, activeAdopterId, token],
    enabled: Boolean(token && postId && canTalk && activeAdopterId && noticeAccepted),
    queryFn: () => {
      const suffix = role === 'author' && picked ? `?adopterId=${encodeURIComponent(picked)}` : '';
      return api<ChatPage>(`/posts/${postId}/adoption-chats/messages${suffix}`, { token });
    },
    refetchInterval: 4000,
  });

  const thread = list.data?.threads.find((item) =>
    role === 'author' ? item.adopterId === picked : true,
  );
  const other =
    messages.data?.other ??
    thread?.other ??
    (role === 'adopter' ? (list.data?.other ?? null) : null);
  const threadId = messages.data?.threadId ?? thread?.id ?? null;
  const closed = Boolean(messages.data?.closed ?? thread?.closed);

  function goBack() {
    if (role === 'author' && picked && !openedWith) {
      setPicked(null);
      return;
    }
    router.back();
  }

  async function acceptNotice() {
    if (!token || accepting) return;
    setAccepting(true);
    try {
      await api('/me/chat-notice', { method: 'POST', token });
      await client.invalidateQueries({ queryKey: ['adoption-chat', postId, token] });
    } catch (error) {
      setNote({ message: messageFrom(error), tone: 'error' });
    } finally {
      setAccepting(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || !token || !postId || sending) return;
    if (role === 'author' && !picked) return;
    setSending(true);
    setNote(null);
    try {
      const sent = await api<SentMessage>(`/posts/${postId}/adoption-chats/messages`, {
        method: 'POST',
        token,
        body: role === 'author' ? { body: text, adopterId: picked } : { body: text },
      });
      setDraft('');
      if (sent.tip) setNote({ message: sent.tip, tone: 'warning' });
      await client.invalidateQueries({ queryKey: ['adoption-chat', postId, token] });
      await client.invalidateQueries({ queryKey: ['adoption-messages', postId] });
      await client.invalidateQueries({ queryKey: ['my-adoption-chats'] });
    } catch (error) {
      // A mensagem barrada fica no campo para a pessoa reescrever.
      setNote({ message: messageFrom(error), tone: 'error' });
    } finally {
      setSending(false);
    }
  }

  async function report(reason: string) {
    if (!other || !token) return;
    setReportOpen(false);
    try {
      // A conversa inteira vai para a equipe; sem conversa aberta ainda, denuncia a pessoa.
      await api('/reports', {
        method: 'POST',
        token,
        body: threadId
          ? { targetType: 'adoption_thread', targetId: threadId, reason }
          : { targetType: 'user', targetId: other.id, reason: `Conversa de adoção: ${reason}` },
      });
      setNote({ message: reportSentNote, tone: 'success' });
    } catch (error) {
      setNote({ message: messageFrom(error), tone: 'error' });
    }
  }

  async function blockPerson() {
    if (!other || !token) return;
    try {
      await api(`/users/${other.id}/block`, { method: 'POST', token });
      await client.invalidateQueries({ queryKey: ['my-adoption-chats'] });
      router.back();
    } catch (error) {
      setNote({ message: messageFrom(error), tone: 'error' });
    }
  }

  const showList = role === 'author' && !picked;
  const showGate = Boolean(token && list.data && !noticeAccepted);
  const showComposer = Boolean(token) && canTalk && !showList && !showGate && !closed;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.column}>
        <Header
          title={showList ? 'Conversas' : (other?.name ?? 'Adoção')}
          subtitle={
            showList
              ? 'Quem quer adotar este animal'
              : other
                ? `@${other.handle} · telefone oculto`
                : 'Telefone oculto'
          }
          onBack={goBack}
          right={
            other && !showList && !showGate ? (
              <View style={styles.headerActions}>
                <IconButton
                  icon="flag"
                  accessibilityLabel="Denunciar conversa"
                  onPress={() => setReportOpen(true)}
                />
                <IconButton
                  icon="slash"
                  accessibilityLabel="Bloquear pessoa"
                  onPress={() => setConfirmBlock(true)}
                />
              </View>
            ) : null
          }
        />
        {token && !showGate ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Conversa monitorada. Ver as regras"
            onPress={() => setRulesOpen(true)}
            style={[styles.monitored, { backgroundColor: colors.infoSoft }]}
          >
            <Icon name="shield" size="sm" color={colors.onInfoSoft} />
            <AppText variant="caption" style={[styles.monitoredText, { color: colors.onInfoSoft }]}>
              Conversa monitorada para a segurança de todos. Nada de venda, Pix ou dados pessoais.
            </AppText>
            <AppText variant="caption" style={{ color: colors.onInfoSoft }}>
              Regras
            </AppText>
          </Touchable>
        ) : null}
        {post.data && !showList && !showGate ? (
          <Touchable
            accessibilityRole="button"
            accessibilityLabel={`Ver o animal: ${animalHeadline(post.data.animal)}`}
            onPress={() => router.push(`/post/${post.data.id}`)}
            style={[styles.animal, { borderBottomColor: colors.border }]}
          >
            {post.data.media[0] ? (
              <Image
                source={{ uri: post.data.media[0].thumbUrl }}
                style={styles.thumb}
                contentFit="cover"
                accessible={false}
              />
            ) : null}
            <View style={styles.animalText}>
              <AppText variant="bodySmallStrong" numberOfLines={1}>
                {animalHeadline(post.data.animal)}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {statusLabel[post.data.status] ?? post.data.status}
              </AppText>
            </View>
            <Icon name="chevron-right" size="sm" color={colors.textSecondary} />
          </Touchable>
        ) : null}
        {note ? (
          <View style={styles.note}>
            <Notice message={note.message} tone={note.tone} />
          </View>
        ) : null}
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.screen}>
            {!token ? (
              <EmptyState
                pose="wave"
                title="Entre para conversar"
                body="A conversa de adoção fica na sua conta. O telefone continua oculto."
              />
            ) : !postId ? (
              <ErrorState
                title="Não encontrei essa conversa"
                body="Volte e abra o animal de novo."
              />
            ) : list.isLoading ? (
              <SkeletonRows />
            ) : list.isError ? (
              <ErrorState
                title="Não consegui abrir a conversa"
                body={messageFrom(list.error)}
                onRetry={() => void list.refetch()}
              />
            ) : showGate ? (
              <ScrollView contentContainerStyle={styles.gate}>
                <Mascot pose="chat" size={EMPTY_MASCOT} />
                <AppText variant="h2" style={styles.center}>
                  Antes de conversar
                </AppText>
                <AppText color="textSecondary" style={styles.center}>
                  A conversa fica dentro do app e o seu telefone continua oculto. Leia as regras:
                </AppText>
                <View style={styles.points}>
                  {chatNoticePoints.map((point) => (
                    <View key={point} style={styles.point}>
                      <Icon name="check-circle" size="sm" color={colors.primary} />
                      <AppText variant="bodySmall" style={styles.pointText}>
                        {point}
                      </AppText>
                    </View>
                  ))}
                </View>
                <Button
                  title="Entendi e concordo"
                  icon="check"
                  fullWidth
                  loading={accepting}
                  onPress={() => void acceptNotice()}
                />
                <Button
                  title="Ler termos e privacidade"
                  variant="ghost"
                  fullWidth
                  onPress={() => router.push('/legal')}
                />
              </ScrollView>
            ) : showList ? (
              <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
                {(list.data?.threads.length ?? 0) === 0 ? (
                  <EmptyState
                    pose="sit"
                    title="Ninguém escreveu ainda"
                    body="Quando alguém quiser adotar, a conversa aparece aqui. O telefone continua oculto."
                  />
                ) : (
                  (list.data?.threads ?? []).map((item) => (
                    <Touchable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Conversa com ${item.other.name}`}
                      onPress={() => setPicked(item.adopterId)}
                      style={styles.thread}
                    >
                      <Avatar name={item.other.name} uri={item.other.avatarUrl} />
                      <View style={styles.threadText}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {item.other.name}
                        </AppText>
                        <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
                          {item.closed ? 'Conversa encerrada pela equipe' : lastLine(item)}
                        </AppText>
                      </View>
                      {item.lastAt ? (
                        <AppText variant="caption" color="textSecondary">
                          {whenLabel(item.lastAt)}
                        </AppText>
                      ) : null}
                    </Touchable>
                  ))
                )}
              </ScrollView>
            ) : !canTalk ? (
              <EmptyState
                pose="sit"
                title="Essa adoção já foi concluída"
                body="Só quem já estava conversando continua na conversa. O telefone continua oculto."
              />
            ) : messages.isLoading ? (
              <SkeletonRows />
            ) : messages.isError ? (
              <ErrorState
                title="Não consegui carregar as mensagens"
                body={messageFrom(messages.error)}
                onRetry={() => void messages.refetch()}
              />
            ) : (
              <ScrollView
                ref={scrollRef}
                style={styles.screen}
                contentContainerStyle={styles.messages}
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
              >
                {(messages.data?.messages.length ?? 0) === 0 ? (
                  <View style={styles.empty}>
                    <Mascot pose="wave" size={EMPTY_MASCOT} />
                    <AppText variant="bodyStrong" style={styles.center}>
                      {role === 'adopter' ? 'Diga oi para quem cuida' : 'Responda quem quer adotar'}
                    </AppText>
                    <AppText variant="bodySmall" color="textSecondary" style={styles.center}>
                      O telefone continua oculto e a adoção é sempre gratuita. Combine a visita por
                      aqui.
                    </AppText>
                    {role === 'adopter' ? (
                      <View style={styles.starters}>
                        {adopterStarters.map((text) => (
                          <Chip
                            key={text}
                            label={text}
                            multiline
                            selected={draft === text}
                            onPress={() => setDraft(text)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  (messages.data?.messages ?? []).map((item) =>
                    item.removed ? (
                      <View
                        key={item.id}
                        style={[
                          styles.bubble,
                          styles.removed,
                          {
                            alignSelf: item.mine ? 'flex-end' : 'flex-start',
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <AppText variant="bodySmall" color="textSecondary">
                          {item.body}
                        </AppText>
                      </View>
                    ) : (
                      <View
                        key={item.id}
                        style={[
                          styles.bubble,
                          item.mine
                            ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                            : { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
                        ]}
                      >
                        <AppText style={{ color: item.mine ? colors.onPrimary : colors.text }}>
                          {item.body}
                        </AppText>
                        <AppText
                          variant="caption"
                          style={{ color: item.mine ? colors.onHeroMuted : colors.textSecondary }}
                        >
                          {whenLabel(item.createdAt)}
                        </AppText>
                      </View>
                    ),
                  )
                )}
                {closed ? (
                  <Notice
                    tone="warning"
                    message="A equipe encerrou esta conversa por segurança. Se precisar, fale com o Suporte."
                  />
                ) : null}
              </ScrollView>
            )}
          </View>
          {showComposer ? (
            <View style={[styles.composer, { borderTopColor: colors.border }]}>
              <View style={styles.field}>
                <Input
                  label="Mensagem"
                  variant="chat"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={500}
                  placeholder={
                    role === 'author' ? 'Escreva para quem quer adotar' : 'Escreva para quem cuida'
                  }
                />
              </View>
              <IconButton
                icon="send"
                variant="filled"
                accessibilityLabel="Enviar mensagem"
                disabled={sending || draft.trim().length === 0}
                onPress={() => void send()}
              />
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
      <BottomSheet
        visible={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title="Regras da conversa"
      >
        <View style={styles.sheet}>
          {chatNoticePoints.map((point) => (
            <View key={point} style={styles.point}>
              <Icon name="check-circle" size="sm" color={colors.primary} />
              <AppText variant="bodySmall" style={styles.pointText}>
                {point}
              </AppText>
            </View>
          ))}
          <Button
            title="Termos e privacidade"
            variant="ghost"
            onPress={() => {
              setRulesOpen(false);
              router.push('/legal');
            }}
          />
        </View>
      </BottomSheet>
      <BottomSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="O que aconteceu?"
      >
        {chatReportReasons.map((reason) => (
          <ListItem
            key={reason}
            title={reason}
            icon="flag"
            showChevron
            onPress={() => void report(reason)}
          />
        ))}
        <ListItem
          title="Viu maus-tratos? Avise a polícia"
          subtitle="190, 181 e a Delegacia Virtual, com o relato pronto."
          icon="shield"
          showChevron
          onPress={() => {
            setReportOpen(false);
            router.push('/maus-tratos');
          }}
        />
      </BottomSheet>
      <ConfirmDialog
        visible={confirmBlock}
        title={other ? `Bloquear ${other.name}?` : 'Bloquear pessoa?'}
        message="Vocês deixam de se ver no app e esta conversa fecha. Se quiser, denuncie também para a equipe olhar."
        confirmLabel="Bloquear"
        destructive
        onCancel={() => setConfirmBlock(false)}
        onConfirm={() => {
          setConfirmBlock(false);
          void blockPerson();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, ...screenColumn },
  note: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerActions: { flexDirection: 'row' },
  monitored: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  monitoredText: { flex: 1 },
  gate: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  points: { alignSelf: 'stretch', gap: spacing.sm, paddingVertical: spacing.sm },
  point: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  pointText: { flex: 1 },
  sheet: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  list: { paddingBottom: spacing.xxl },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  threadText: { flex: 1, gap: spacing.xs },
  messages: { padding: spacing.lg, gap: spacing.sm },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  removed: { borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  composer: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: { flex: 1 },
  animal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.sm },
  animalText: { flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  center: { textAlign: 'center' },
  starters: { alignSelf: 'stretch', gap: spacing.sm, paddingTop: spacing.md },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
