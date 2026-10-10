import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Input } from './components/ui';
import { formatWhen } from './format';
import { radius, spacing, statusLabel, useTheme } from './theme';
import type { Post } from './types';

const DOT = 12;
const RAIL = 2;

export function AnimalDiary({
  post,
  canWrite,
  onPublish,
}: {
  post: Post;
  canWrite: boolean;
  onPublish: (description: string) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const notes = post.updates ?? [];
  const entries = [
    {
      id: post.id,
      title: 'Achado',
      body: post.description,
      when: post.createdAt,
      handle: post.author.handle,
    },
    ...notes.map((note) => ({
      id: note.id,
      title: (note.status && statusLabel[note.status]) || 'Nota',
      body: note.description,
      when: note.createdAt,
      handle: note.author.handle,
    })),
  ];

  async function publish() {
    const description = text.trim();
    if (!description || sending) return;
    setSending(true);
    const ok = await onPublish(description);
    setSending(false);
    if (ok) setText('');
  }

  return (
    <View style={styles.block}>
      <AppText variant="h2">Diário</AppText>
      <AppText variant="bodySmall" color="textSecondary">
        As atualizações ficam neste resgate. Quem acompanha recebe o aviso.
      </AppText>
      <View>
        {entries.map((entry, index) => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
              {index < entries.length - 1 ? (
                <View style={[styles.line, { backgroundColor: colors.border }]} />
              ) : null}
            </View>
            <View style={styles.entry}>
              <AppText variant="bodyStrong">
                {entry.title} · {formatWhen(entry.when)}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                @{entry.handle}
              </AppText>
              <AppText>{entry.body}</AppText>
            </View>
          </View>
        ))}
      </View>
      {canWrite ? (
        <View style={styles.composer}>
          <Input
            label="Nova nota"
            value={text}
            onChangeText={setText}
            placeholder="Como ele está agora?"
            multiline
            maxLength={300}
            helper={`${text.length}/300`}
          />
          <Button
            title={sending ? 'Publicando...' : 'Publicar no diário'}
            accessibilityLabel="Publicar no diário"
            icon="send"
            loading={sending}
            disabled={text.trim().length === 0}
            fullWidth
            onPress={() => void publish()}
          />
        </View>
      ) : (
        <AppText variant="bodySmall" color="textSecondary">
          Toque em Eu vou ajudar para escrever no diário deste animal.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: DOT, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill, marginTop: spacing.xs },
  line: { width: RAIL, flex: 1, marginTop: spacing.xs },
  entry: { flex: 1, gap: spacing.xs, paddingBottom: spacing.lg },
  composer: { gap: spacing.md },
});
