import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api, loadFeed, messageFrom } from '../api';
import { animalHeadline, placeOf } from '../animalLabels';
import {
  AppText,
  BottomSheet,
  Button,
  Card,
  Divider,
  Input,
  ListItem,
  Notice,
  SkeletonRows,
} from '../components/ui';
import { formatWhen } from '../format';
import { spacing } from '../theme';
import type { Passport } from './passport';

/**
 * Escolher o outro post do mesmo animal. Mostra os da mesma espécie, recentes; quem cuida dos
 * dois junta na hora, senão quem cuida do outro recebe o pedido para confirmar.
 */
export function LinkSheet({
  visible,
  passport,
  token,
  onClose,
  onDone,
}: {
  visible: boolean;
  passport: Passport;
  token: string | null;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const candidates = useQuery({
    queryKey: ['link-candidates', passport.species, token],
    queryFn: () => loadFeed(token, `?species=${passport.species}&limit=30`),
    enabled: visible,
  });
  const own = new Set(passport.occurrences.map((item) => item.postId));
  const list = (candidates.data?.posts ?? []).filter((post) => !own.has(post.id));

  async function send() {
    if (sending) return;
    if (!chosen) {
      setError('Escolha o outro post.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Conte por que é o mesmo animal (uma mancha, a coleira, o lugar).');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await api<{ status: 'accepted' | 'pending' }>(
        `/animals/${passport.id}/links`,
        { method: 'POST', token, body: { postId: chosen, reason: reason.trim() } },
      );
      await onDone(
        result.status === 'accepted'
          ? 'Pronto: as ocorrências agora são um passaporte só.'
          : 'Pedido enviado. Quem publicou o outro post confirma se é o mesmo animal.',
      );
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Mesmo animal de outro post">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <AppText color="textSecondary">
          Junte só quando tiver certeza. O histórico dos dois posts passa a ficar num passaporte só.
        </AppText>
        {candidates.isLoading ? (
          <SkeletonRows />
        ) : list.length === 0 ? (
          <Notice tone="info" message="Não achei outros posts recentes desta espécie." />
        ) : (
          <Card padding="none" elevation="sm">
            {list.map((post, index) => (
              <View key={post.id}>
                {index > 0 ? <Divider inset /> : null}
                <ListItem
                  title={animalHeadline(post.animal)}
                  subtitle={`${placeOf(post.approxLabel)} · ${formatWhen(post.createdAt)}`}
                  icon={chosen === post.id ? 'check-circle' : 'circle'}
                  accessibilityLabel={`${animalHeadline(post.animal)} em ${post.approxLabel}${chosen === post.id ? ', escolhido' : ''}`}
                  onPress={() => setChosen(post.id)}
                />
              </View>
            ))}
          </Card>
        )}
        <Input
          label="Por que é o mesmo animal"
          placeholder="Ex.: mesma mancha branca no peito e coleira azul"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={300}
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Juntar as ocorrências"
          fullWidth
          loading={sending}
          onPress={() => void send()}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.xl },
});
