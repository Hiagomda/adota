import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadPost, messageFrom } from '../../src/api';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Header,
  Notice,
  SkeletonRows,
  useToast,
} from '../../src/components/ui';
import { MatchCard } from '../../src/lost/MatchCard';
import type { LostMatch, MatchList } from '../../src/lost/lostMatch';
import { sharePoster } from '../../src/lost/sharePoster';
import { reportError } from '../../src/crash/reporter';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/**
 * Sugestões da busca de perdidos de um post. Para o tutor: animais encontrados ou vistos que
 * podem ser o dele. Para quem encontrou: perdidos que podem ser este animal.
 */
export default function LostMatchesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissing, setDismissing] = useState<LostMatch | null>(null);
  const [linked, setLinked] = useState<Set<string>>(() => new Set());

  const list = useQuery({
    queryKey: ['lost-matches', id, token],
    queryFn: () => api<MatchList>(`/posts/${id}/matches`, { token }),
    enabled: Boolean(id && token),
  });
  const post = useQuery({
    queryKey: ['post', id, token],
    queryFn: () => loadPost(id, token),
    enabled: Boolean(id),
  });
  const data = list.data;
  const lostSide = data?.side === 'lost';

  async function searchAgain() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await api<{ found: number }>(`/posts/${id}/matches/refresh`, {
        method: 'POST',
        token,
      });
      await list.refetch();
      toast.show(
        result.found > 0
          ? `Procurei de novo: ${result.found} ${result.found === 1 ? 'sugestão' : 'sugestões'}.`
          : 'Procurei de novo e ainda não achei nenhum parecido.',
        'success',
      );
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function decide(match: LostMatch, decision: 'confirm' | 'dismiss') {
    if (busy) return;
    setBusy(match.id);
    try {
      await api(`/lost-matches/${match.id}/${decision}`, { method: 'POST', token });
      await client.invalidateQueries({ queryKey: ['lost-matches', id] });
      toast.show(
        decision === 'confirm'
          ? 'Avisamos quem publicou. Combinem pelo app como ele volta para casa.'
          : 'Tudo bem, tirei essa sugestão.',
        'success',
      );
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setBusy(null);
    }
  }

  // Depois de reconhecer, o tutor pode juntar as duas ocorrências no passaporte do animal.
  async function linkPassport(match: LostMatch) {
    const animalId = post.data?.animal.id;
    if (!animalId || busy) return;
    setBusy(match.id);
    try {
      const result = await api<{ status: string }>(`/animals/${animalId}/links`, {
        method: 'POST',
        token,
        body: {
          postId: match.post.id,
          reason: 'O tutor reconheceu o animal pela busca de perdidos.',
        },
      });
      setLinked((current) => new Set(current).add(match.id));
      toast.show(
        result.status === 'accepted'
          ? 'Pronto: as duas ocorrências agora são um passaporte só.'
          : 'Pedido enviado. Quem publicou o outro post confirma no passaporte.',
        'success',
      );
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setBusy(null);
    }
  }

  function share() {
    if (!post.data) return;
    sharePoster(post.data).catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'lost-matches:poster' });
      toast.show('Não consegui abrir o compartilhamento. Tente de novo.', 'error');
    });
  }

  const matches = data?.matches ?? [];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header
            title={
              !data
                ? 'Busca de perdidos'
                : lostSide
                  ? 'Pode ser o seu animal'
                  : 'Alguém procura este animal?'
            }
            onBack={() => router.back()}
          />
          {!token ? (
            <EmptyState
              pose="login"
              title="Entre na sua conta"
              body="As sugestões aparecem só para quem publicou o post."
              actionLabel="Entrar"
              onAction={() => router.push('/login')}
            />
          ) : list.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : list.isError || !data ? (
            <ErrorState
              title="Não consegui abrir as sugestões"
              body={messageFrom(list.error)}
              onRetry={() => void list.refetch()}
            />
          ) : (
            <View style={styles.body}>
              <Notice
                tone="info"
                message={
                  lostSide
                    ? 'São sugestões pela espécie, porte, cor, sinais, lugar, data e tons das fotos. Só você sabe se é ele: confira as fotos antes. Ninguém deve pedir dinheiro para devolver.'
                    : 'Este animal parece com um perdido publicado perto. Só o tutor confirma. Se ele falar com você, combinem a devolução pelo app, sem pagamento.'
                }
              />
              {lostSide && !data.searching ? (
                <Notice tone="success" message="Ele voltou para casa. A busca parou." />
              ) : null}
              {matches.length === 0 ? (
                <EmptyState
                  pose="search"
                  compact
                  title={lostSide ? 'Nenhum parecido por enquanto' : 'Nenhum perdido parecido'}
                  body={
                    lostSide
                      ? 'A cada animal encontrado ou visto perto, a gente compara de novo e te avisa. Compartilhe o cartaz nos grupos do bairro enquanto isso.'
                      : 'Se aparecer um perdido parecido com este, a gente avisa aqui.'
                  }
                />
              ) : (
                matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    score={match.score}
                    strength={match.strength}
                    reasons={match.reasons}
                    distanceKm={match.distanceKm}
                    post={match.post}
                    when={match.post.type === 'lost' ? 'Sumiu' : 'Visto'}
                    confirmed={match.status === 'confirmed'}
                    onOpen={() => router.push(`/post/${match.post.id}`)}
                  >
                    <View style={styles.actions}>
                      {lostSide && match.status === 'suggested' ? (
                        <Button
                          title="É ele!"
                          icon="heart"
                          loading={busy === match.id}
                          onPress={() => void decide(match, 'confirm')}
                        />
                      ) : null}
                      {lostSide && match.status === 'confirmed' && !linked.has(match.id) ? (
                        <Button
                          title="Juntar no passaporte"
                          icon="book-open"
                          variant="secondary"
                          loading={busy === match.id}
                          onPress={() => void linkPassport(match)}
                        />
                      ) : null}
                      <Button
                        title="Ver o post"
                        variant="outline"
                        onPress={() => router.push(`/post/${match.post.id}`)}
                      />
                      {match.status === 'suggested' ? (
                        <Button
                          title="Não é"
                          variant="ghost"
                          disabled={busy === match.id}
                          onPress={() => setDismissing(match)}
                        />
                      ) : null}
                    </View>
                  </MatchCard>
                ))
              )}
              {data.searching ? (
                <Button
                  title="Procurar de novo"
                  icon="refresh-cw"
                  variant="outline"
                  fullWidth
                  loading={refreshing}
                  onPress={() => void searchAgain()}
                />
              ) : null}
              {lostSide && data.searching && post.data ? (
                <Button
                  title="Compartilhar o cartaz"
                  icon="share-2"
                  variant="secondary"
                  fullWidth
                  onPress={share}
                />
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={dismissing !== null}
        title="Não é esse animal?"
        message="A sugestão some da lista. Você pode procurar de novo depois."
        confirmLabel="Não é"
        onConfirm={() => {
          const target = dismissing;
          setDismissing(null);
          if (target) void decide(target, 'dismiss');
        }}
        onCancel={() => setDismissing(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
