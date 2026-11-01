import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import { AppText, BottomSheet, Button, Icon, Input, Notice, Touchable } from '../components/ui';
import { toneColors } from '../components/ui/tones';
import { radius, spacing, useTheme } from '../theme';
import { accents, TAGLINE_MAX, type NgoAccent } from './panel';

const SWATCH = 52;

/** A ONG escolhe a cor do painel e a frase que aparece embaixo do nome. */
export function ThemeSheet({
  visible,
  token,
  accent,
  tagline,
  onClose,
  onSaved,
}: {
  visible: boolean;
  token: string | null;
  accent: NgoAccent;
  tagline: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  // Rascunho por cima do que veio da API: abrir de novo começa do que está salvo.
  const [draft, setDraft] = useState<{ accent?: NgoAccent; tagline?: string }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = draft.accent ?? accent;
  const phrase = draft.tagline ?? tagline ?? '';

  function close() {
    setDraft({});
    setError(null);
    onClose();
  }

  async function save() {
    if (!token || saving) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = phrase.trim();
      await api('/me/ngo-panel/theme', {
        method: 'PUT',
        token,
        body: { accent: chosen, ...(trimmed ? { tagline: trimmed } : {}) },
      });
      setDraft({});
      onSaved();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={close} title="Tema do painel">
      <View style={styles.body}>
        <AppText color="textSecondary">
          Escolha a cor da sua ONG. Ela aparece no topo do painel e nos números.
        </AppText>
        <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Cor">
          {accents.map((option) => {
            const tone = toneColors(colors, option.tone);
            const selected = option.value === chosen;
            return (
              <Touchable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                onPress={() => setDraft((current) => ({ ...current, accent: option.value }))}
                style={styles.swatchCell}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: tone.background,
                      borderColor: selected ? tone.foreground : colors.border,
                    },
                  ]}
                >
                  {selected ? <Icon name="check" color={tone.foreground} /> : null}
                </View>
                <AppText
                  variant="caption"
                  color={selected ? 'text' : 'textSecondary'}
                  numberOfLines={2}
                  style={styles.swatchLabel}
                >
                  {option.label}
                </AppText>
              </Touchable>
            );
          })}
        </View>
        <Input
          label="Frase da ONG (se quiser)"
          value={phrase}
          onChangeText={(text) =>
            setDraft((current) => ({ ...current, tagline: text.slice(0, TAGLINE_MAX) }))
          }
          placeholder="Ex.: Resgatando os gatos do Guamá desde 2019"
          maxLength={TAGLINE_MAX}
          helper={`${phrase.length}/${TAGLINE_MAX}`}
        />
        {error ? <Notice tone="error" message={error} /> : null}
        <Button
          title="Salvar tema"
          icon="check"
          fullWidth
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.md },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatchCell: { width: SWATCH + spacing.lg, alignItems: 'center', gap: spacing.xs },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: radius.pill,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: { textAlign: 'center' },
});
