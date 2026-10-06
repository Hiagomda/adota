import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadPost, siteUrl } from '../../src/api';
import { useSession } from '../../src/session';
import { nextStatus, palette, statusLabel, useTheme } from '../../src/theme';

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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
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

  async function act(path: string, method = 'POST', body?: unknown) {
    if (!token) return;
    await api(path, { method, token, body });
    await client.invalidateQueries({ queryKey: ['post', id, token] });
  }

  const item = post.data;
  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <Text style={{ color: theme.muted, padding: 24 }}>Carregando o alerta...</Text>
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
            {statusLabel[item.status]} · {item.location.exact ? 'local exato' : 'local aproximado'}
            {item.author.phone ? ` · WhatsApp ${item.author.phone}` : ''}
          </Text>
          {item.helpRequest ? (
            <Text style={{ color: theme.muted }}>
              Pix: {item.helpRequest.pixKey ?? 'não informado'}. {item.helpRequest.paymentNotice}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable onPress={() => void act(`/posts/${item.id}/like`)}>
              <Text style={{ color: theme.text }}>
                {item.liked ? 'Curtido' : 'Curtir'} {item.counts.likes}
              </Text>
            </Pressable>
            <Pressable onPress={() => void act(`/posts/${item.id}/save`)}>
              <Text style={{ color: theme.text }}>{item.saved ? 'Salvo' : 'Salvar'}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                void Share.share({
                  message: `${item.approxLabel} no Égua, adota! ${siteUrl}/p/${item.id}`,
                  url: `${siteUrl}/p/${item.id}`,
                })
              }
            >
              <Text style={{ color: theme.text }}>Compartilhar</Text>
            </Pressable>
            <Pressable onPress={() => setCommentsOpen(true)}>
              <Text style={{ color: theme.text }}>Comentários</Text>
            </Pressable>
            <Pressable onPress={() => setReportOpen(true)}>
              <Text style={{ color: theme.muted }}>Denunciar</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.primary}
            onPress={() => void act(`/posts/${item.id}/responses`, 'POST', { kind: 'will_help' })}
          >
            <Text style={styles.primaryText}>
              {item.viewerWillHelp ? 'Você vai ajudar' : 'Eu vou ajudar'}
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable onPress={() => void act(`/users/${item.author.id}/follow`)}>
              <Text style={{ color: theme.text }}>Seguir</Text>
            </Pressable>
            <Pressable onPress={() => void act(`/posts/${item.id}/follow`)}>
              <Text style={{ color: theme.text }}>Seguir alerta</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void act(`/users/${item.author.id}/block`).then(() => router.back());
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
                  {foster.name} · {foster.distanceKm} km
                </Text>
              ))}
            </View>
          ) : null}
          {item.status === 'for_adoption' ? (
            <Pressable
              onPress={() =>
                void act(`/posts/${item.id}/adoption-term`, 'POST', {
                  body: 'Aceito cuidar do animal, manter a castração e avisar a pessoa que resgatou sobre a adaptação.',
                }).then(() =>
                  setNote('Termo registrado. A adoção ainda depende de vocês, fora do app.'),
                )
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
                }).then(() => setNote('Acompanhamento publicado.'))
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
            style={[styles.sheet, { backgroundColor: theme.surface }]}
            onPress={() => undefined}
          >
            <Text style={{ color: theme.text, fontWeight: '700' }}>Comentários</Text>
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
              onPress={() => {
                void act(`/posts/${item.id}/comments`, 'POST', { body: comment }).then(() => {
                  setComment('');
                  void client.invalidateQueries({ queryKey: ['comments', id] });
                });
              }}
            >
              <Text style={{ color: theme.text }}>Publicar</Text>
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
            style={[styles.sheet, { backgroundColor: theme.surface }]}
            onPress={() => undefined}
          >
            <Text style={{ color: theme.text, fontWeight: '700' }}>Por que você denuncia?</Text>
            {['Conteúdo abusivo', 'Parece venda de animal', 'Informação falsa', 'Spam'].map(
              (reason) => (
                <Pressable
                  key={reason}
                  style={styles.secondary}
                  onPress={() => {
                    void act('/reports', 'POST', {
                      targetType: 'post',
                      targetId: item.id,
                      reason,
                    }).then(() => {
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  back: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  photo: { aspectRatio: 4 / 5 },
  copy: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
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
