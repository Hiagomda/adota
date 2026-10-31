import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  channels,
  channelUrl,
  DRAFT_LIMITS,
  draftReady,
  evidenceSteps,
  reportText,
  signs,
  type Channel,
  type ReportDraft,
} from '../src/abuse/guide';
import {
  AppText,
  Button,
  Card,
  HeroSurface,
  Icon,
  Input,
  Notice,
  SectionHeader,
  Touchable,
  useToast,
} from '../src/components/ui';
import { Cupu } from '../src/cupu/Cupu';
import { radius, screenColumn, size, spacing, useTheme } from '../src/theme';

const emptyDraft: ReportDraft = { what: '', where: '', when: '', animal: '' };
const CUPU_SIZE = 112;
const SIGN_ICON = 40;
const STEP = 36;
/** Quanto o cartão do 190 sobe sobre a onda da capa. */
const EMERGENCY_LIFT = spacing.xxxl;

/**
 * Como denunciar maus-tratos: para quem ligar em Belém, o que conta como maus-tratos, como juntar
 * provas sem se arriscar e um relato pronto para colar na Delegacia Virtual. O app não acusa
 * ninguém: só orienta e leva até a autoridade.
 */
export default function AbuseGuideScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft);
  const set = (key: keyof ReportDraft) => (text: string) =>
    setDraft((current) => ({ ...current, [key]: text.slice(0, DRAFT_LIMITS[key]) }));
  const ready = draftReady(draft);
  const emergency = channels.find((channel) => channel.id === 'pm');
  const others = channels.filter((channel) => channel.id !== 'pm');

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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <HeroSurface
          patternColor={colors.onHero}
          style={[styles.hero, { paddingTop: insets.top + spacing.sm }]}
        >
          <View style={styles.column}>
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={() => router.back()}
              style={styles.back}
            >
              <Icon name="arrow-left" size="lg" color={colors.onHero} />
            </Touchable>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <AppText variant="h1" style={{ color: colors.onHero }}>
                  Denunciar{'\n'}maus-tratos
                </AppText>
                <AppText style={{ color: colors.onHeroMuted }}>
                  Você pode ser a voz de um animal que não tem como pedir ajuda.
                </AppText>
              </View>
              <Cupu size={CUPU_SIZE} pose="sad" scene={null} />
            </View>
            <View style={[styles.law, { backgroundColor: colors.heroGlass }]}>
              <Icon name="book-open" size="sm" color={colors.onHero} />
              <AppText variant="caption" style={[styles.lawText, { color: colors.onHero }]}>
                É crime (Lei 9.605/1998, art. 32). Com cão ou gato, a pena é de 2 a 5 anos de
                reclusão (Lei 14.064/2020).
              </AppText>
            </View>
          </View>
        </HeroSurface>

        <View style={styles.column}>
          {emergency ? (
            <View
              style={[styles.emergency, shadows.lg, { backgroundColor: colors.errorText }]}
              accessible
              accessibilityLabel="Está acontecendo agora? Ligue 190, a Polícia Militar."
            >
              <View style={styles.emergencyTop}>
                <View style={styles.grow}>
                  <AppText variant="caption" style={{ color: colors.textInverse }}>
                    ESTÁ ACONTECENDO AGORA?
                  </AppText>
                  <AppText variant="bodySmall" style={{ color: colors.textInverse }}>
                    Agressão, envenenamento ou animal em risco de vida. Não enfrente ninguém.
                  </AppText>
                </View>
                <AppText variant="stat" style={{ color: colors.textInverse }}>
                  190
                </AppText>
              </View>
              <Touchable
                accessibilityRole="button"
                accessibilityLabel="Ligar 190"
                haptic="medium"
                onPress={() => void open(emergency)}
                style={[styles.callNow, { backgroundColor: colors.surface }]}
              >
                <Icon name="phone-call" color={colors.errorText} />
                <AppText variant="button" style={{ color: colors.errorText }}>
                  Ligar 190 agora
                </AppText>
              </Touchable>
            </View>
          ) : null}

          <SectionHeader title="Para quem denunciar" subtitle="Canais oficiais no Pará" />
          <View style={styles.channels}>
            {others.map((channel) => {
              const call = channel.action.kind === 'call';
              const soft = call ? colors.primarySoft : colors.infoSoft;
              const strong = call ? colors.onPrimarySoft : colors.onInfoSoft;
              return (
                <Touchable
                  key={channel.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${channel.title}. ${channel.when}. ${channel.detail}`}
                  pressedScale={0.97}
                  onPress={() => void open(channel)}
                  style={[styles.channel, { backgroundColor: soft }]}
                >
                  {call ? (
                    <AppText variant="display" style={{ color: strong }}>
                      {channel.action.kind === 'call' ? channel.action.number : ''}
                    </AppText>
                  ) : (
                    <View style={[styles.channelIcon, { backgroundColor: colors.surface }]}>
                      <Icon name="globe" size="lg" color={strong} />
                    </View>
                  )}
                  <AppText variant="bodyStrong" style={{ color: strong }}>
                    {call ? 'Disque-Denúncia' : 'Delegacia Virtual'}
                  </AppText>
                  <AppText variant="caption" style={{ color: strong }}>
                    {channel.when}
                  </AppText>
                  <AppText variant="bodySmall" style={[styles.grow, { color: strong }]}>
                    {channel.detail}
                  </AppText>
                  <View style={[styles.channelAction, { backgroundColor: colors.surface }]}>
                    <Icon name={call ? 'phone' : 'external-link'} size="sm" color={strong} />
                    <AppText variant="bodySmallStrong" style={{ color: strong }}>
                      {call ? 'Ligar' : 'Abrir'}
                    </AppText>
                  </View>
                </Touchable>
              );
            })}
          </View>

          <SectionHeader title="O que é maus-tratos" />
          <View style={styles.signs}>
            {signs.map((sign) => (
              <View key={sign.label} style={[styles.sign, { backgroundColor: colors.surface }]}>
                <View style={[styles.signIcon, { backgroundColor: colors.errorSoft }]}>
                  <Icon name={sign.icon} color={colors.onErrorSoft} />
                </View>
                <AppText variant="bodySmallStrong">{sign.label}</AppText>
              </View>
            ))}
          </View>

          <SectionHeader title="Antes de denunciar" subtitle="Proteja você e as provas" />
          <View style={styles.steps}>
            {evidenceSteps.map((step, index) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                    <AppText variant="bodyStrong" style={{ color: colors.onPrimary }}>
                      {index + 1}
                    </AppText>
                  </View>
                  {index < evidenceSteps.length - 1 ? (
                    <View style={[styles.stepLine, { backgroundColor: colors.primarySoft }]} />
                  ) : null}
                </View>
                <AppText style={styles.stepText}>{step}</AppText>
              </View>
            ))}
          </View>

          <SectionHeader title="Monte o relato" subtitle="Fica só no seu celular" />
          <View style={styles.pad}>
            <Card elevation="md" padding="lg">
              <View style={styles.form}>
                <View style={styles.formHead}>
                  <View style={[styles.signIcon, { backgroundColor: colors.primarySoft }]}>
                    <Icon name="file-text" color={colors.onPrimarySoft} />
                  </View>
                  <AppText variant="bodySmall" color="textSecondary" style={styles.grow}>
                    Preencha e copie para colar na Delegacia Virtual ou ler na ligação.
                  </AppText>
                </View>
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
                {ready ? (
                  <View
                    style={[
                      styles.paper,
                      { backgroundColor: colors.surfaceMuted, borderLeftColor: colors.primary },
                    ]}
                  >
                    <AppText variant="caption" color="textSecondary">
                      SEU RELATO
                    </AppText>
                    <AppText variant="bodySmall">{reportText(draft)}</AppText>
                  </View>
                ) : null}
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
                    title="Enviar"
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
            </Card>
          </View>

          <View style={[styles.rescue, { backgroundColor: colors.secondarySoft }]}>
            <Cupu size={CUPU_SIZE - spacing.xl} pose="search" scene={null} />
            <View style={styles.rescueText}>
              <AppText variant="h3" style={{ color: colors.onSecondarySoft }}>
                O animal precisa de resgate?
              </AppText>
              <AppText variant="bodySmall" style={{ color: colors.onSecondarySoft }}>
                Depois de avisar a polícia, publique. Quem está perto recebe o aviso.
              </AppText>
              <Button
                title="Publicar resgate"
                icon="alert-circle"
                variant="secondary"
                onPress={() => router.push('/create')}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  hero: { paddingBottom: size.curve + EMERGENCY_LIFT + spacing.lg },
  back: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  heroText: { flex: 1, gap: spacing.xs },
  law: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  lawText: { flex: 1 },
  grow: { flex: 1 },
  emergency: {
    marginHorizontal: spacing.lg,
    marginTop: -EMERGENCY_LIFT,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emergencyTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  callNow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: size.touch + spacing.sm,
    borderRadius: radius.pill,
  },
  channels: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  channel: { flex: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  channelAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  signs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sign: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  signIcon: {
    width: SIGN_ICON,
    height: SIGN_ICON,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: { paddingHorizontal: spacing.lg },
  step: { flexDirection: 'row', gap: spacing.md },
  stepRail: { alignItems: 'center', width: STEP },
  stepNumber: {
    width: STEP,
    height: STEP,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: { width: 3, flex: 1, minHeight: spacing.md, borderRadius: 2 },
  stepText: { flex: 1, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  pad: { paddingHorizontal: spacing.lg },
  form: { gap: spacing.md },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  paper: {
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  rescue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.xl,
  },
  rescueText: { flex: 1, gap: spacing.sm },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
