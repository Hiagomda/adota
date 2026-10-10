import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { AppModal, AppText, Button } from '../components/ui';
import { reportError } from '../crash/reporter';
import { spacing, useTheme } from '../theme';
import { applyOtaUpdate, checkForAppUpdate, type AppUpdateOffer } from './checkForAppUpdate';
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
      return;
    }

    phase.current = 'downloading';
    setPrompt({ phase: 'downloading', offer, ratio: null });
    try {
      await applyOtaUpdate();
    } catch (error) {
      reportError(error, { source: 'handled', where: 'update:ota-apply' });
      phase.current = 'error';
      setPrompt({ phase: 'error', offer, needsPermission: false });
    }
  }

  const visible = prompt.phase !== 'hidden';
  const offer = prompt.phase === 'hidden' ? null : prompt.offer;
  const native = offer?.kind === 'native';
  const busy = prompt.phase === 'downloading';
  const needsPermission = prompt.phase === 'error' && prompt.needsPermission;
  const ratio = prompt.phase === 'downloading' ? prompt.ratio : null;
  const actionLabel = needsPermission
    ? 'Permitir instalação'
    : prompt.phase === 'error'
      ? 'Tentar de novo'
      : native
        ? 'Instalar agora'
        : 'Atualizar';

  return (
    <AppModal
      visible={visible}
      onClose={dismiss}
      title={native ? 'Nova versão do aplicativo' : 'Atualização disponível'}
      dismissable={!busy}
    >
      <AppText color="textSecondary">
        {prompt.phase === 'error'
          ? needsPermission
            ? 'O Android precisa da sua permissão para instalar a atualização por aqui.'
            : 'Não consegui concluir a atualização. Tente de novo daqui a pouco.'
          : native
            ? `Alpha de teste · versão ${offer && offer.kind === 'native' ? offer.version : ''}`
            : 'Tem uma versão nova do Égua, adota!. Quer baixar e abrir agora?'}
      </AppText>
      {native && offer?.kind === 'native' && offer.notes.length > 0 ? (
        <View style={styles.notes}>
          <AppText variant="bodyStrong">O que mudou</AppText>
          {offer.notes.map((note) => (
            <AppText key={note} color="textSecondary">
              {`• ${note}`}
            </AppText>
          ))}
        </View>
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
