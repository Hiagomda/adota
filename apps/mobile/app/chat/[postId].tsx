import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Avatar,
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Input,
  Notice,
  SkeletonRows,
  Touchable,
} from '../../src/components/ui';
import { useSession } from '../../src/session';
import { radius, spacing, useTheme } from '../../src/theme';

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
  other: ChatPerson;
}

interface ChatList {
  role: 'author' | 'adopter';
  canStart: boolean;
  other: ChatPerson | null;
  threads: ChatThread[];
}

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

interface ChatPage {
  other: ChatPerson;
  messages: ChatMessage[];
  nextCursor: string | null;
}

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
  const [note, setNote] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['adoption-chat', postId, token],
    enabled: Boolean(token && postId),
    queryFn: () => api<ChatList>(`/posts/${postId}/adoption-chats`, { token }),
    refetchInterval: picked ? false : 8000,
  });

  const role = list.data?.role;
  const activeAdopterId = role === 'author' ? picked : role === 'adopter' ? 'self' : null;
  const canTalk =
    role === 'adopter'
      ? Boolean(list.data && (list.data.canStart || list.data.threads.length > 0))
      : Boolean(picked);

  const messages = useQuery({
    queryKey: ['adoption-messages', postId, activeAdopterId, token],
    enabled: Boolean(token && postId && canTalk && activeAdopterId),
    queryFn: () => {
      const suffix = role === 'author' && picked ? `?adopterId=${encodeURIComponent(picked)}` : '';
      return api<ChatPage>(`/posts/${postId}/adoption-chats/messages${suffix}`, { token });
    },
    refetchInterval: 4000,
  });

  const thread = list.data?.threads.find((item) => item.adopterId === picked);
  const other =
    messages.data?.other ??
    thread?.other ??
    (role === 'adopter' ? (list.data?.other ?? null) : null);

  function goBack() {
    if (role === 'author' && picked && !openedWith) {
      setPicked(null);
      return;
    }
    router.back();
  }

  async function send() {
    const text = draft.trim();
    if (!text || !token || !postId || sending) return;
    if (role === 'author' && !picked) return;
    setSending(true);
    setNote(null);
    try {
      await api(`/posts/${postId}/adoption-chats/messages`, {
        method: 'POST',
        token,
        body: role === 'author' ? { body: text, adopterId: picked } : { body: text },
      });
      setDraft('');
      await client.invalidateQueries({ queryKey: ['adoption-chat', postId, token] });
      await client.invalidateQueries({ queryKey: ['adoption-messages', postId] });
    } catch (error) {
      setNote(messageFrom(error));
    } finally {
      setSending(false);
    }
  }

  async function reportPerson() {
    if (!other || !token) return;
    try {
      await api('/reports', {
        method: 'POST',
        token,
        body: {
          targetType: 'user',
          targetId: other.id,
          reason: 'Mensagem inadequada na conversa de adoção.',
        },
      });
      setNote('Denúncia enviada. A equipe analisa essa conta.');
    } catch (error) {
      setNote(messageFrom(error));
    }
  }

  async function blockPerson() {
    if (!other || !token) return;
    try {
      await api(`/users/${other.id}/block`, { method: 'POST', token });
      router.back();
    } catch (error) {
      setNote(messageFrom(error));
    }
  }

  const showList = role === 'author' && !picked;
  const showComposer = Boolean(token) && canTalk && !showList;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <Header
        title={showList ? 'Conversas' : (other?.name ?? 'Adoção')}
        subtitle={
          showList
            ? 'Só você vê estas conversas'
            : other
              ? `@${other.handle} · telefone oculto`
              : 'Telefone oculto'
        }
        onBack={goBack}
        right={
          other && !showList ? (
            <View style={styles.headerActions}>
              <IconButton
                icon="flag"
                accessibilityLabel="Denunciar pessoa"
                onPress={() => void reportPerson()}
              />
              <IconButton
                icon="slash"
                accessibilityLabel="Bloquear pessoa"
                onPress={() => void blockPerson()}
              />
            </View>
          ) : null
        }
      />
      {note ? (
        <View style={styles.note}>
          <Notice message={note} />
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
            <ErrorState title="Não encontrei essa conversa" body="Volte e abra o animal de novo." />
          ) : list.isLoading ? (
            <SkeletonRows />
          ) : list.isError ? (
            <ErrorState
              title="Não consegui abrir a conversa"
              body={messageFrom(list.error)}
              onRetry={() => void list.refetch()}
            />
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
                        {item.lastBody ?? 'Conversa aberta'}
                      </AppText>
                    </View>
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
                <AppText color="textSecondary">
                  Escreva a primeira mensagem. A conversa fica só entre vocês dois, o telefone
                  continua oculto e o app não recebe dinheiro.
                </AppText>
              ) : (
                (messages.data?.messages ?? []).map((item) => (
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
                ))
              )}
            </ScrollView>
          )}
        </View>
        {showComposer ? (
          <View style={[styles.composer, { borderTopColor: colors.border }]}>
            <View style={styles.field}>
              <Input
                label="Mensagem"
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={500}
                placeholder="Escreva para quem cuida"
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  note: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerActions: { flexDirection: 'row' },
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
});

export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
