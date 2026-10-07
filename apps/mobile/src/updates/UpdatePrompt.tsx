import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../theme';
import { applyOtaUpdate, checkForAppUpdate, type AppUpdateOffer } from './checkForAppUpdate';

type PromptState =
  | { phase: 'hidden' }
  | { phase: 'ask'; offer: AppUpdateOffer }
  | { phase: 'downloading'; offer: AppUpdateOffer }
  | { phase: 'error'; offer: AppUpdateOffer };

export function UpdatePrompt() {
  const theme = useTheme();
  const [prompt, setPrompt] = useState<PromptState>({ phase: 'hidden' });
  const snoozed = useRef(false);
  const checking = useRef(false);
  const phase = useRef(prompt.phase);

  useEffect(() => {
    phase.current = prompt.phase;
  }, [prompt]);

  useEffect(() => {
    let alive = true;

    async function lookForUpdate() {
      if (snoozed.current || checking.current || phase.current !== 'hidden') return;
      checking.current = true;
      try {
        const offer = await checkForAppUpdate();
        if (!alive || snoozed.current || !offer) return;
        phase.current = 'ask';
        setPrompt({ phase: 'ask', offer });
      } finally {
        checking.current = false;
      }
    }

    void lookForUpdate();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      snoozed.current = false;
      void lookForUpdate();
    });

    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  function dismiss() {
    snoozed.current = true;
    phase.current = 'hidden';
    setPrompt({ phase: 'hidden' });
  }

  async function accept(offer: AppUpdateOffer) {
    if (offer.kind === 'native') {
      try {
        await Linking.openURL(offer.apkUrl);
        dismiss();
      } catch {
        phase.current = 'error';
        setPrompt({ phase: 'error', offer });
      }
      return;
    }

    phase.current = 'downloading';
    setPrompt({ phase: 'downloading', offer });
    try {
      await applyOtaUpdate();
    } catch {
      phase.current = 'error';
      setPrompt({ phase: 'error', offer });
    }
  }

  const visible = prompt.phase !== 'hidden';
  const offer = prompt.phase === 'hidden' ? null : prompt.offer;
  const native = offer?.kind === 'native';
  const busy = prompt.phase === 'downloading';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            {native ? 'Nova versão do aplicativo' : 'Atualização disponível'}
          </Text>
          <Text style={[styles.body, { color: theme.muted }]}>
            {prompt.phase === 'error'
              ? 'Não consegui concluir a atualização. Tente de novo daqui a pouco.'
              : native
                ? 'Esta atualização precisa de um aplicativo novo. Baixe o arquivo e confirme a instalação no Android.'
                : 'Tem uma versão nova do Égua, adota!. Quer baixar e abrir agora?'}
          </Text>
          {busy ? (
            <View style={styles.busy} accessibilityRole="progressbar">
              <ActivityIndicator color={theme.accent} />
              <Text style={{ color: theme.text }}>Baixando a atualização…</Text>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agora não"
                onPress={dismiss}
                style={[styles.button, styles.secondary, { borderColor: theme.line }]}
              >
                <Text style={[styles.buttonText, { color: theme.text }]}>Agora não</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  prompt.phase === 'error'
                    ? 'Tentar de novo'
                    : native
                      ? 'Baixar o app'
                      : 'Atualizar'
                }
                onPress={() => {
                  if (offer) void accept(offer);
                }}
                style={[styles.button, { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.buttonText, { color: theme.onAccent }]}>
                  {prompt.phase === 'error'
                    ? 'Tentar de novo'
                    : native
                      ? 'Baixar o app'
                      : 'Atualizar'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(23, 59, 63, 0.45)',
  },
  card: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondary: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  busy: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
