import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { AppModal, AppText, Button, Notice } from '../components/ui';
import { reportError } from '../crash/reporter';
import { spacing, useTheme } from '../theme';
import { pendingOutboxCount } from '../place/outbox';
import {
  checkForAppUpdate,
  downloadPageUrl,
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

  if (prompt.phase === 'ask' && prompt.offer.reinstall) {
    return <ReinstallPrompt offer={prompt.offer} onClose={dismiss} />;
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

/**
 * Versão assinada com a chave nova. O instalador recusaria por cima ("app não instalado"), então
 * em vez de baixar aqui o app explica a reinstalação e abre a página de download no navegador.
 */
function ReinstallPrompt({ offer, onClose }: { offer: AppUpdateOffer; onClose: () => void }) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    pendingOutboxCount()
      .then((count) => {
        if (alive) setPending(count);
      })
      .catch((error: unknown) => {
        reportError(error, { source: 'handled', where: 'update:reinstall-outbox' });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppModal visible onClose={onClose} title="Instale o aplicativo de novo">
      <AppText color="textSecondary">
        {`A versão ${offer.version} veio com uma assinatura nova e mais segura. Desta vez o Android não atualiza por cima: é preciso desinstalar e instalar de novo, uma vez só.`}
      </AppText>
      <View style={styles.notes}>
        <AppText variant="bodyStrong">Como fazer</AppText>
        <AppText variant="caption" color="textSecondary">
          1. Toque em “Abrir página de download” e baixe o aplicativo.
        </AppText>
        <AppText variant="caption" color="textSecondary">
          2. Desinstale o Égua, adota! que está no celular.
        </AppText>
        <AppText variant="caption" color="textSecondary">
          3. Abra o arquivo baixado e entre com a mesma conta.
        </AppText>
      </View>
      <AppText variant="caption" color="textSecondary">
        Sua conta, seus resgates e suas conversas ficam guardados no servidor.
      </AppText>
      {pending > 0 ? (
        <Notice
          tone="warning"
          message={
            pending === 1
              ? 'Tem 1 resgate esperando internet neste celular. Espere ele ser enviado antes de desinstalar, senão ele se perde.'
              : `Tem ${pending} resgates esperando internet neste celular. Espere eles serem enviados antes de desinstalar, senão eles se perdem.`
          }
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          title="Abrir página de download"
          variant="secondary"
          fullWidth
          onPress={() => {
            void Linking.openURL(downloadPageUrl).catch((error: unknown) => {
              reportError(error, { source: 'handled', where: 'update:reinstall-open' });
            });
          }}
        />
        <Button title="Agora não" variant="ghost" fullWidth onPress={onClose} />
      </View>
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
