import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, View } from 'react-native';
import { AppModal, AppText, Button } from '../components/ui';
import { reportError } from '../crash/reporter';
import { spacing, useTheme } from '../theme';
import {
  checkForAppUpdate,
  startStartupUpdateCheck,
  type AppUpdateOffer,
} from './checkForAppUpdate';
import { installApk, openInstallPermission } from './installApk';

type PromptState =
  | { phase: 'hidden' }
  | { phase: 'ask'; offer: AppUpdateOffer }
  | { phase: 'downloading'; offer: AppUpdateOffer; ratio: number | null }
  | { phase: 'error'; offer: AppUpdateOffer; needsPermission: boolean };

export function UpdatePrompt() {
  const { colors } = useTheme();
  const [prompt, setPrompt] = useState<PromptState>({ phase: 'hidden' });
  const snoozed = useRef(false);
  const checking = useRef(false);
  const phase = useRef(prompt.phase);

  useEffect(() => {
    phase.current = prompt.phase;
  }, [prompt]);

  useEffect(() => {
    let alive = true;

    async function lookForUpdate(check: () => Promise<AppUpdateOffer | null>) {
      if (snoozed.current || checking.current || phase.current !== 'hidden') return;
      checking.current = true;
      try {
        const offer = await check();
        if (!alive || snoozed.current || !offer) return;
        phase.current = 'ask';
        setPrompt({ phase: 'ask', offer });
      } finally {
        checking.current = false;
      }
    }

    // The root layout already started this check before anything else; reuse its answer.
    void lookForUpdate(startStartupUpdateCheck);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      snoozed.current = false;
      void lookForUpdate(checkForAppUpdate);
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
    phase.current = 'downloading';
    setPrompt({ phase: 'downloading', offer, ratio: null });
    try {
      await installApk(offer.apkUrl, (progress) => {
        if (phase.current !== 'downloading') return;
        setPrompt({ phase: 'downloading', offer, ratio: progress.ratio });
      });
      phase.current = 'hidden';
      setPrompt({ phase: 'hidden' });
    } catch (error) {
      reportError(error, { source: 'handled', where: 'update:install-apk' });
      const text = error instanceof Error ? error.message.toLowerCase() : '';
      const needsPermission = text.includes('permission') || text.includes('denied');
      phase.current = 'error';
      setPrompt({ phase: 'error', offer, needsPermission });
    }
  }

  const visible = prompt.phase !== 'hidden';
  const offer = prompt.phase === 'hidden' ? null : prompt.offer;
  const busy = prompt.phase === 'downloading';
  const needsPermission = prompt.phase === 'error' && prompt.needsPermission;
  const ratio = prompt.phase === 'downloading' ? prompt.ratio : null;
  const actionLabel = needsPermission
    ? 'Permitir instalação'
    : prompt.phase === 'error'
      ? 'Tentar de novo'
      : 'Instalar agora';

  return (
    <AppModal
      visible={visible}
      onClose={dismiss}
      title="Nova versão do aplicativo"
      dismissable={!busy}
    >
      <AppText color="textSecondary">
        {prompt.phase === 'error'
          ? needsPermission
            ? 'O Android precisa da sua permissão para instalar a atualização por aqui.'
            : 'Não consegui concluir a atualização. Tente de novo daqui a pouco.'
          : `Alpha de teste · versão ${offer?.version ?? ''}`}
      </AppText>
      {offer && offer.notes.length > 0 ? (
        <ScrollView style={styles.notesScroll} contentContainerStyle={styles.notes}>
          <AppText variant="bodyStrong">O que mudou</AppText>
          {offer.notes.map((note) => (
            <AppText key={note} variant="caption" color="textSecondary">
              {note}
            </AppText>
          ))}
        </ScrollView>
      ) : null}
      {busy ? (
        <View style={styles.busy} accessibilityRole="progressbar">
          <ActivityIndicator color={colors.primary} />
          <AppText>
            {ratio === null
              ? 'Baixando a atualização…'
              : `Baixando a atualização… ${Math.round(ratio * 100)}%`}
          </AppText>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            title={actionLabel}
            variant="secondary"
            fullWidth
            onPress={() => {
              if (!offer) return;
              if (needsPermission) {
                void openInstallPermission().catch((error: unknown) => {
                  reportError(error, { source: 'handled', where: 'update:install-permission' });
                });
                return;
              }
              void accept(offer);
            }}
          />
          <Button title="Agora não" variant="ghost" fullWidth onPress={dismiss} />
        </View>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  notesScroll: { maxHeight: 96 },
  notes: { gap: spacing.xs },
  actions: { gap: spacing.sm, paddingTop: spacing.sm },
  busy: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
});
