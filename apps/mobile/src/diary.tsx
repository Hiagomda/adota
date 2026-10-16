import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Icon, Input, type IconName } from './components/ui';
import { formatWhen } from './format';
import { diaryLines, type DiaryTone } from './post/diaryEntries';
import { radius, spacing, useTheme, type ColorRoles } from './theme';
import type { Post } from './types';

const BADGE = 32;
const RAIL = 2;

/** Each kind of line has its own mark, so a missed visit never reads like progress. */
const toneStyle: Record<
  DiaryTone,
  { icon: IconName; background: keyof ColorRoles; foreground: keyof ColorRoles }
> = {
  found: { icon: 'map-pin', background: 'secondarySoft', foreground: 'onSecondarySoft' },
  status: { icon: 'arrow-right', background: 'primarySoft', foreground: 'onPrimarySoft' },
  not_found: { icon: 'search', background: 'warningSoft', foreground: 'onWarningSoft' },
  note: { icon: 'edit-3', background: 'surfaceMuted', foreground: 'textSecondary' },
};

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
  const entries = diaryLines(post);

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
        {entries.map((entry, index) => {
          const tone = toneStyle[entry.tone];
          return (
            <View
              key={entry.id}
              accessible
              accessibilityLabel={`${entry.title}, ${formatWhen(entry.when)}. ${entry.body ?? ''}`}
              style={styles.row}
            >
              <View style={styles.rail}>
                <View style={[styles.badge, { backgroundColor: colors[tone.background] }]}>
                  <Icon name={tone.icon} size="sm" color={colors[tone.foreground]} />
                </View>
                {index < entries.length - 1 ? (
                  <View style={[styles.line, { backgroundColor: colors.border }]} />
                ) : null}
              </View>
              <View style={styles.entry}>
                <AppText variant="bodyStrong">{entry.title}</AppText>
                <AppText variant="caption" color="textSecondary">
                  @{entry.handle} · {formatWhen(entry.when)}
                </AppText>
                {entry.body ? <AppText>{entry.body}</AppText> : null}
              </View>
            </View>
          );
        })}
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
  rail: { width: BADGE, alignItems: 'center' },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { width: RAIL, flex: 1, marginVertical: spacing.xs },
  entry: { flex: 1, gap: spacing.xs, paddingBottom: spacing.lg },
  composer: { gap: spacing.md },
});
