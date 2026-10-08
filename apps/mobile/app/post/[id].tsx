import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadPost, messageFrom, siteUrl } from '../../src/api';
import { formatKm, formatWhen } from '../../src/format';
import { useSession } from '../../src/session';
import { nextStatus, palette, statusLabel, useTheme } from '../../src/theme';
import { EmptyState, SkeletonCard } from '../../src/ui';

interface Comment {
  id: string;
  body: string;
  author: { handle: string };
}

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helping, setHelping] = useState(false);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const { width } = useWindowDimensions();
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

  const item = post.data;
  if (post.isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: theme.text }}>Fechar</Text>
        </Pressable>
        <EmptyState
          pose="sad"
          title="Não encontrei este resgate"
          body={messageFrom(post.error)}
          actionLabel="Tentar de novo"
          onAction={() => void post.refetch()}
        />
      </SafeAreaView>
    );
  }
  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <SkeletonCard />
      </SafeAreaView>
    );
  }
  const following = nextStatus[item.status];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: theme.text }}>Fechar</Text>
        </Pressable>
        <ScrollView horizontal pagingEnabled>
          {item.media.map((media) => (
            <Image
              key={media.url}
              source={{ uri: media.url }}
              style={[styles.photo, { width }]}
              contentFit="cover"
            />
          ))}
        </ScrollView>
        <View style={styles.copy}>
          <Pressable onPress={() => router.push(`/user/${item.author.handle}`)}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              @{item.author.handle}
              {item.author.verified ? ' · verificado' : ''}
            </Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{item.approxLabel}</Text>
          <Text style={{ color: theme.text }}>{item.description}</Text>
          <Text style={{ color: theme.muted }}>
            {statusLabel[item.status] ?? 'Resgate'} · {formatWhen(item.createdAt)} ·{' '}
            {item.location.exact ? 'ponto exato' : 'ponto aproximado, cerca de 500 m'}
            {item.author.phone ? ` · WhatsApp ${item.author.phone}` : ''}
          </Text>
          {item.helpRequest ? (
            <Text style={{ color: theme.muted }}>
              Pix: {item.helpRequest.pixKey ?? 'não informado'}. {item.helpRequest.paymentNotice}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.hit} onPress={() => void act(`/posts/${item.id}/like`)}>
              <Text style={{ color: theme.text }}>
                {item.liked ? 'Curtido' : 'Curtir'} {item.counts.likes}
              </Text>
            </Pressable>
            <Pressable style={styles.hit} onPress={() => void act(`/posts/${item.id}/save`)}>
              <Text style={{ color: theme.text }}>{item.saved ? 'Salvo' : 'Salvar'}</Text>
            </Pressable>
            <Pressable
              style={styles.hit}
              onPress={() =>
                void Share.share({
                  message: `${item.approxLabel} no Égua, adota! ${siteUrl}/p/${item.id}`,
                  url: `${siteUrl}/p/${item.id}`,
                })
              }
            >
              <Text style={{ color: theme.text }}>Compartilhar</Text>
            </Pressable>
            <Pressable style={styles.hit} onPress={() => setCommentsOpen(true)}>
              <Text style={{ color: theme.text }}>Comentários</Text>
            </Pressable>
            <Pressable style={styles.hit} onPress={() => setReportOpen(true)}>
              <Text style={{ color: theme.muted }}>Denunciar</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Eu vou ajudar"
            style={styles.primary}
            onPress={() => {
              if (item.viewerWillHelp) {
                setNote(
                  'Você já está neste resgate. O ponto exato continua visível para você.',
                );
                return;
              }
              if (!token) {
                setNote('Entre na sua conta para dizer que vai ajudar.');
                return;
              }
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
              setHelpOpen(true);
            }}
          >
            <Text style={styles.primaryText}>
              {item.viewerWillHelp ? 'Você vai ajudar' : 'Eu vou ajudar'}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable style={styles.hit} onPress={() => void act(`/users/${item.author.id}/follow`)}>
              <Text style={{ color: theme.text }}>Seguir</Text>
            </Pressable>
            <Pressable style={styles.hit} onPress={() => void act(`/posts/${item.id}/follow`)}>
              <Text style={{ color: theme.text }}>Acompanhar resgate</Text>
            </Pressable>
            <Pressable
              style={styles.hit}
              onPress={() => {
                void act(`/users/${item.author.id}/block`).then((ok) => {
                  if (ok) router.back();
                });
              }}
            >
              <Text style={{ color: theme.muted }}>Bloquear</Text>
            </Pressable>
          </View>
          {following ? (
            <Pressable
              style={styles.secondary}
              onPress={() => void act(`/posts/${item.id}/status`, 'PATCH', { status: following })}
            >
              <Text style={{ color: theme.text }}>Marcar como {statusLabel[following]}</Text>
            </Pressable>
          ) : null}
          {(fosters.data?.fosters.length ?? 0) > 0 ? (
            <View>
              <Text style={{ color: theme.text, fontWeight: '700' }}>Lares temporários perto</Text>
              {fosters.data?.fosters.map((foster) => (
                <Text key={foster.id} style={{ color: theme.muted }}>
                  {foster.name} · {formatKm(foster.distanceKm)}
                </Text>
              ))}
            </View>
          ) : null}
          {item.status === 'for_adoption' ? (
            <Pressable
              onPress={() =>
                void act(`/posts/${item.id}/adoption-term`, 'POST', {
                  body: 'Aceito cuidar do animal, manter a castração e avisar a pessoa que resgatou sobre a adaptação.',
                }).then((ok) => {
                  if (ok) setNote('Termo registrado. A adoção ainda depende de vocês, fora do app.');
                })
              }
            >
              <Text style={{ color: theme.text }}>Aceitar termo de adoção</Text>
            </Pressable>
          ) : null}
          {item.status === 'adopted' ? (
            <Pressable
              onPress={() =>
                void api('/posts', {
                  method: 'POST',
                  token,
                  body: {
                    type: 'update',
                    species: item.animal.species,
                    size: item.animal.size,
                    urgency: 'low',
                    description: 'Acompanhamento depois da adoção: o animal está bem.',
                    latitude: item.location.latitude,
                    longitude: item.location.longitude,
                    approxLabel: item.approxLabel,
                    parentPostId: item.id,
                    media: [],
                  },
                })
                  .then(() => setNote('Acompanhamento publicado.'))
                  .catch((error: unknown) => setNote(messageFrom(error)))
              }
            >
              <Text style={{ color: theme.text }}>Publicar acompanhamento</Text>
            </Pressable>
          ) : null}
          {note ? <Text style={{ color: theme.muted }}>{note}</Text> : null}
          {item.updates?.map((update) => (
            <Text key={update.id} style={{ color: theme.muted }}>
              @{update.author.handle}: {update.description}
            </Text>
          ))}
        </View>
      </ScrollView>
      <Modal
        visible={commentsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCommentsOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={() => undefined}
          >
            <Text style={{ color: theme.text, fontWeight: '700' }}>Comentários</Text>
            {comments.isError ? (
              <Text style={{ color: theme.muted }}>{messageFrom(comments.error)}</Text>
            ) : !comments.isLoading && (comments.data?.comments.length ?? 0) === 0 ? (
              <Text style={{ color: theme.muted }}>Ninguém comentou ainda. Escreva o primeiro.</Text>
            ) : null}
            {(comments.data?.comments ?? []).map((itemComment) => (
              <Text key={itemComment.id} style={{ color: theme.text }}>
                @{itemComment.author.handle} {itemComment.body}
              </Text>
            ))}
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Escreva um comentário"
              placeholderTextColor={theme.muted}
              style={[styles.input, { color: theme.text, borderColor: theme.line }]}
            />
            <Pressable
              style={styles.hit}
              disabled={comment.trim().length === 0}
              onPress={() => {
                const body = comment.trim();
                if (!body) return;
                void act(`/posts/${item.id}/comments`, 'POST', { body }).then((ok) => {
                  if (!ok) return;
                  setComment('');
                  void client.invalidateQueries({ queryKey: ['comments', id] });
                });
              }}
            >
              <Text style={{ color: comment.trim().length === 0 ? theme.muted : theme.text }}>Publicar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={reportOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setReportOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setReportOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={() => undefined}
          >
            <Text style={{ color: theme.text, fontWeight: '700' }}>Por que você denuncia?</Text>
            {['Conteúdo abusivo', 'Parece venda de animal', 'Informação falsa', 'É spam'].map(
              (reason) => (
                <Pressable
                  key={reason}
                  style={styles.secondary}
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
                >
                  <Text style={{ color: theme.text }}>{reason}</Text>
                </Pressable>
              ),
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={helpOpen} animationType="slide" transparent onRequestClose={() => setHelpOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setHelpOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}
            onPress={() => undefined}
          >
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 18 }}>Você vai ajudar?</Text>
            <Text style={{ color: theme.muted, lineHeight: 22 }}>
              O ponto exato deste resgate passa a aparecer para você. O WhatsApp da pessoa só entra se ela
              autorizou o contato. O app não recebe dinheiro.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.primary}
              disabled={helping}
              onPress={() => void confirmHelp()}
            >
              <Text style={styles.primaryText}>{helping ? 'Confirmando...' : 'Confirmar, eu vou ajudar'}</Text>
            </Pressable>
            <Pressable style={styles.hit} onPress={() => setHelpOpen(false)}>
              <Text style={{ color: theme.muted }}>Agora não</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  photo: { aspectRatio: 4 / 5 },
  copy: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  hit: { minHeight: 44, justifyContent: 'center' },
  primary: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: palette.acai, fontWeight: '700' },
  secondary: { minHeight: 44, justifyContent: 'center' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    minHeight: 280,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 12,
  },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
