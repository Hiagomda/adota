import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  channels,
  channelUrl,
  DRAFT_LIMITS,
  draftReady,
  evidenceSteps,
  LAW_NOTE,
  reportText,
  signs,
  type Channel,
  type ReportDraft,
} from '../src/abuse/guide';
import {
  AppText,
  Button,
  Card,
  Header,
  Icon,
  Input,
  Notice,
  SectionHeader,
  useToast,
} from '../src/components/ui';
import { toneColors } from '../src/components/ui/tones';
import { screenColumn, spacing, radius, useTheme } from '../src/theme';

const emptyDraft: ReportDraft = { what: '', where: '', when: '', animal: '' };

/**
 * Como denunciar maus-tratos: para quem ligar em Belém, o que conta como maus-tratos, como juntar
 * provas sem se arriscar e um relato pronto para colar na Delegacia Virtual. O app não acusa
 * ninguém: só orienta e leva até a autoridade.
 */
export default function AbuseGuideScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft);
  const set = (key: keyof ReportDraft) => (text: string) =>
    setDraft((current) => ({ ...current, [key]: text.slice(0, DRAFT_LIMITS[key]) }));
  const ready = draftReady(draft);
  const alert = toneColors(colors, 'error');

  async function open(channel: Channel) {
    const url = channelUrl(channel.action);
    try {
      await Linking.openURL(url);
    } catch (error) {
      // Celular sem discador (tablet) ou sem navegador: mostra o número para a pessoa anotar.
      console.warn('maus-tratos: não abriu', url, error);
      toast.show(
        channel.action.kind === 'call'
          ? `Ligue para ${channel.action.number} pelo telefone.`
          : `Abra ${channel.action.url} no navegador.`,
        'info',
      );
    }
  }

  async function copy() {
    await Clipboard.setStringAsync(reportText(draft));
    toast.show('Relato copiado. Cole na Delegacia Virtual ou leia na ligação.', 'success');
  }

  async function share() {
    try {
      await Share.share({ message: reportText(draft) });
    } catch (error) {
      console.warn('maus-tratos: compartilhar falhou', error);
      toast.show('Não consegui abrir o compartilhar. Use o botão Copiar.', 'error');
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header title="Denunciar maus-tratos" large onBack={() => router.back()} />
          <View style={styles.body}>
            <View style={[styles.urgent, { backgroundColor: alert.background }]}>
              <Icon name="alert-triangle" color={alert.foreground} size="lg" />
              <View style={styles.grow}>
                <AppText variant="bodyStrong" style={{ color: alert.foreground }}>
                  Está acontecendo agora?
                </AppText>
                <AppText variant="bodySmall" style={{ color: alert.foreground }}>
                  Ligue 190. Não enfrente ninguém: sua segurança vem primeiro.
                </AppText>
              </View>
            </View>

            <AppText color="textSecondary">{LAW_NOTE}</AppText>
          </View>

          <SectionHeader
            title="Para quem denunciar"
            subtitle="Canais oficiais em Belém e no Pará"
          />
          <View style={styles.list}>
            {channels.map((channel) => (
              <Card key={channel.id} elevation="sm" padding="md">
                <View style={styles.channel}>
                  <AppText variant="caption" color="textSecondary">
                    {channel.when.toUpperCase()}
                  </AppText>
                  <AppText variant="h3">{channel.title}</AppText>
                  <AppText variant="bodySmall" color="textSecondary">
                    {channel.detail}
                  </AppText>
                  <Button
                    title={channel.actionLabel}
                    icon={channel.action.kind === 'call' ? 'phone' : 'external-link'}
                    variant={channel.id === 'pm' ? 'primary' : 'outline'}
                    onPress={() => void open(channel)}
                  />
                </View>
              </Card>
            ))}
          </View>

          <SectionHeader title="O que é maus-tratos" />
          <View style={styles.list}>
            <Card elevation="none" padding="md" style={{ backgroundColor: colors.surfaceMuted }}>
              <View style={styles.bullets}>
                {signs.map((sign) => (
                  <View key={sign} style={styles.bullet}>
                    <Icon name="x-circle" size="sm" color={colors.error} />
                    <AppText variant="bodySmall" style={styles.grow}>
                      {sign}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          </View>

          <SectionHeader title="Antes de denunciar" />
          <View style={styles.list}>
            {evidenceSteps.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={[styles.stepNumber, { backgroundColor: colors.primarySoft }]}>
                  <AppText variant="bodyStrong" style={{ color: colors.onPrimarySoft }}>
                    {index + 1}
                  </AppText>
                </View>
                <AppText style={styles.grow}>{step}</AppText>
              </View>
            ))}
          </View>

          <SectionHeader
            title="Monte o relato"
            subtitle="Fica no seu celular. Copie e cole na Delegacia Virtual ou leia na ligação."
          />
          <View style={styles.form}>
            <Input
              label="O que você viu"
              value={draft.what}
              onChangeText={set('what')}
              placeholder="Ex.: cachorro preso numa corrente curta, sem água, magro"
              multiline
              maxLength={DRAFT_LIMITS.what}
            />
            <Input
              label="Onde"
              value={draft.where}
              onChangeText={set('where')}
              placeholder="Rua, número, bairro e um ponto de referência"
              maxLength={DRAFT_LIMITS.where}
            />
            <Input
              label="Quando (se souber)"
              value={draft.when}
              onChangeText={set('when')}
              placeholder="Ex.: todo dia desde segunda, à tarde"
              maxLength={DRAFT_LIMITS.when}
            />
            <Input
              label="Como é o animal (se quiser)"
              value={draft.animal}
              onChangeText={set('animal')}
              placeholder="Ex.: vira-lata caramelo, porte médio"
              maxLength={DRAFT_LIMITS.animal}
            />
            <Notice
              tone="info"
              message="Não publique no app nome, rosto ou endereço de quem você denuncia. Isso vai só para a polícia."
            />
            <View style={styles.actions}>
              <Button
                title="Copiar"
                icon="copy"
                variant="outline"
                disabled={!ready}
                onPress={() => void copy()}
                style={styles.grow}
              />
              <Button
                title="Compartilhar"
                icon="share-2"
                disabled={!ready}
                onPress={() => void share()}
                style={styles.grow}
              />
            </View>
            {!ready ? (
              <AppText variant="caption" color="textSecondary">
                Conte o que viu e onde para liberar os botões.
              </AppText>
            ) : null}
          </View>

          <SectionHeader title="O animal precisa de resgate?" />
          <View style={styles.list}>
            <AppText color="textSecondary">
              Depois de avisar a polícia, publique um resgate. Quem está perto recebe o aviso e pode
              ajudar.
            </AppText>
            <Button
              title="Publicar um resgate"
              icon="alert-circle"
              variant="secondary"
              onPress={() => router.push('/create')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const NUMBER = 32;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  urgent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  grow: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  channel: { gap: spacing.xs },
  bullets: { gap: spacing.sm },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepNumber: {
    width: NUMBER,
    height: NUMBER,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { paddingHorizontal: spacing.lg, gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
