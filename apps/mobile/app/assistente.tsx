import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActionCard,
  AppText,
  Button,
  Card,
  Checkbox,
  Chip,
  Header,
  Icon,
  Input,
  Segmented,
  useToast,
} from '../src/components/ui';
import {
  abuseNowGuidance,
  isGrave,
  lostDescription,
  lostUrgency,
  rescueDescription,
  rescueGuidance,
  signOptions,
  situations,
  suggestUrgency,
  urgencyLabel,
  urgencyReason,
  type Guidance,
  type LostWhen,
  type Sign,
  type Situation,
  type Species,
  type Urgency,
} from '../src/cupu/assistant';
import { Cupu } from '../src/cupu/Cupu';
import type { IconName } from '../src/components/ui/Icon';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';

const CUPU_SIZE = 88;
const EXTRA_LIMIT = 300;

const situationIcon: Record<Situation, IconName> = {
  street: 'alert-circle',
  lost_mine: 'search',
  found_owner: 'tag',
  abuse: 'shield',
  need_help: 'package',
};

const speciesOptions = [
  { value: 'dog', label: 'Cachorro' },
  { value: 'cat', label: 'Gato' },
  { value: 'other', label: 'Outro' },
] as const;

const whenOptions = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'older', label: 'Há dias' },
] as const;

const urgencyChoices: Urgency[] = ['high', 'medium', 'low'];

type Step = 'start' | Situation;

/**
 * "Não sei por onde começar": o Cupu pergunta o que está acontecendo e leva para o fluxo certo
 * (resgate, perdido, maus-tratos ou ajuda). Em caso grave, o que fazer agora aparece logo que a
 * pessoa marca o sinal, antes de qualquer outra pergunta. A urgência é só sugestão: ela muda.
 */
export default function AssistantScreen() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [step, setStep] = useState<Step>('start');
  const [species, setSpecies] = useState<Species>('dog');
  const [signs, setSigns] = useState<Sign[]>([]);
  const [extra, setExtra] = useState('');
  const [edited, setEdited] = useState<string | null>(null);
  const [chosenUrgency, setChosenUrgency] = useState<Urgency | null>(null);
  const [lostWhen, setLostWhen] = useState<LostWhen>('today');
  const [collar, setCollar] = useState(false);
  const [abuseNow, setAbuseNow] = useState<boolean | null>(null);

  const suggested = step === 'lost_mine' ? lostUrgency(lostWhen) : suggestUrgency(signs);
  const urgency = chosenUrgency ?? suggested;
  const generated =
    step === 'lost_mine'
      ? lostDescription(lostWhen, collar, extra)
      : rescueDescription(signs, species, extra);
  const description = edited ?? generated;
  const guidance = rescueGuidance(signs);
  const grave = isGrave(signs);

  function go(next: Step) {
    setStep(next);
    setEdited(null);
    setChosenUrgency(null);
    setAbuseNow(null);
  }

  function toggle(sign: Sign, on: boolean) {
    setSigns((current) => (on ? [...current, sign] : current.filter((item) => item !== sign)));
  }

  function publish(kind: 'rescue_alert' | 'lost') {
    router.navigate({
      pathname: '/create',
      params: {
        kind,
        urgency,
        species,
        description: description.slice(0, 1000),
        cupu: String(Date.now()),
      },
    });
  }

  async function call(number: string) {
    try {
      await Linking.openURL(`tel:${number}`);
    } catch (error) {
      // Tablet sem discador: mostra o número para a pessoa ligar de outro aparelho.
      console.warn('assistente: não abriu o discador', number, error);
      toast.show(`Ligue para ${number} pelo telefone.`, 'info');
    }
  }

  const back = () => (step === 'start' ? router.back() : go('start'));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerColumn}>
        <Header title="Cupu te ajuda" large onBack={back} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.giant }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          {step === 'start' ? (
            <>
              <View style={styles.hello}>
                <Cupu size={CUPU_SIZE} pose="wave" scene={null} />
                <AppText variant="h3" style={styles.flex}>
                  O que está acontecendo? Eu te mostro o caminho.
                </AppText>
              </View>
              {situations.map((item) => (
                <ActionCard
                  key={item.value}
                  title={item.title}
                  description={item.detail}
                  icon={situationIcon[item.value]}
                  tone={item.value === 'street' || item.value === 'abuse' ? 'secondary' : 'primary'}
                  onPress={() => go(item.value)}
                />
              ))}
            </>
          ) : null}

          {step === 'street' ? (
            <>
              <Question title="O que você vê?" hint="Marque tudo que vale. Pode pular." />
              <View style={styles.group}>
                {signOptions.map((option) => (
                  <Checkbox
                    key={option.value}
                    label={option.label}
                    checked={signs.includes(option.value)}
                    onChange={(on) => toggle(option.value, on)}
                  />
                ))}
              </View>
              {guidance.length > 0 ? (
                <GuidanceCard
                  title={grave ? 'Faça agora' : 'Antes de publicar'}
                  steps={guidance}
                  urgent={grave}
                  call={signs.includes('trapped') ? () => void call('193') : undefined}
                  callLabel="Ligar 193, Bombeiros"
                />
              ) : null}
              <Question title="Que animal é?" />
              <Segmented
                accessibilityLabel="Que animal é"
                options={speciesOptions}
                value={species}
                onChange={setSpecies}
              />
              <UrgencyPicker
                suggested={suggested}
                value={urgency}
                reason={urgencyReason(signs)}
                onChange={setChosenUrgency}
              />
              <DescriptionEditor
                extraLabel="Mais alguma coisa? (onde está, como ele é)"
                extra={extra}
                onExtra={setExtra}
                description={description}
                edited={edited !== null}
                onEdit={setEdited}
                onReset={() => setEdited(null)}
              />
              <Button
                title="Publicar o resgate"
                icon="camera"
                size="lg"
                fullWidth
                accessibilityHint="Abre a câmera com o texto e a urgência já preenchidos"
                onPress={() => publish('rescue_alert')}
              />
            </>
          ) : null}

          {step === 'lost_mine' ? (
            <>
              <Question title="Quando ele sumiu?" />
              <Segmented
                accessibilityLabel="Quando ele sumiu"
                options={whenOptions}
                value={lostWhen}
                onChange={setLostWhen}
              />
              <Checkbox label="Usa coleira" checked={collar} onChange={setCollar} />
              <Card padding="md" elevation="none" style={{ backgroundColor: colors.primarySoft }}>
                <AppText variant="bodySmall" style={{ color: colors.onPrimarySoft }}>
                  {lostWhen === 'older'
                    ? 'Mesmo depois de dias, muitos voltam. Publique e veja se alguém já achou um parecido.'
                    : 'Nas primeiras horas ele costuma estar perto. Ande pelo quarteirão chamando com calma, e publique para os vizinhos ficarem de olho.'}
                </AppText>
              </Card>
              <UrgencyPicker
                suggested={suggested}
                value={urgency}
                reason={
                  lostWhen === 'older'
                    ? 'Faz dias: a busca agora é mais pelos vizinhos e pelo mapa.'
                    : 'Sumiu há pouco: quanto antes avisar, mais perto ele está.'
                }
                onChange={setChosenUrgency}
              />
              <DescriptionEditor
                extraLabel="Nome, como ele é e como chamar"
                extra={extra}
                onExtra={setExtra}
                description={description}
                edited={edited !== null}
                onEdit={setEdited}
                onReset={() => setEdited(null)}
              />
              <Button
                title="Publicar o perdido"
                icon="camera"
                size="lg"
                fullWidth
                onPress={() => publish('lost')}
              />
              <Button
                title="Ver animais achados por perto"
                icon="search"
                variant="outline"
                fullWidth
                onPress={() => router.push('/lost-search')}
              />
            </>
          ) : null}

          {step === 'found_owner' ? (
            <>
              <Question
                title="Primeiro, veja se alguém já procura por ele"
                hint="Quem perdeu um animal publica aqui. Compare as fotos antes de tudo."
              />
              <Button
                title="Procurar entre os perdidos"
                icon="search"
                size="lg"
                fullWidth
                onPress={() => router.push('/lost-search')}
              />
              <Card padding="md" elevation="none" style={{ backgroundColor: colors.primarySoft }}>
                <AppText variant="bodySmall" style={{ color: colors.onPrimarySoft }}>
                  Não achou? Publique como resgate: quem perdeu também vê os resgates do mapa. Se
                  ele tiver plaquinha com telefone, ligue para o número antes.
                </AppText>
              </Card>
              <Button
                title="Publicar como resgate"
                icon="alert-circle"
                variant="outline"
                fullWidth
                onPress={() => go('street')}
              />
            </>
          ) : null}

          {step === 'abuse' ? (
            <>
              <Question title="Está acontecendo agora?" />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    title="Sim, agora"
                    size="lg"
                    variant={abuseNow === true ? 'primary' : 'outline'}
                    fullWidth
                    onPress={() => setAbuseNow(true)}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    title="Não"
                    size="lg"
                    variant="outline"
                    fullWidth
                    onPress={() => router.push('/maus-tratos')}
                  />
                </View>
              </View>
              {abuseNow ? (
                <GuidanceCard
                  title="Faça agora"
                  steps={abuseNowGuidance}
                  urgent
                  call={() => void call('190')}
                  callLabel="Ligar 190 agora"
                />
              ) : null}
              <Button
                title="Ver como denunciar com provas"
                icon="shield"
                variant="ghost"
                fullWidth
                onPress={() => router.push('/maus-tratos')}
              />
            </>
          ) : null}

          {step === 'need_help' ? (
            <>
              <Question
                title="Do que ele precisa?"
                hint="O app não recebe nem repassa dinheiro. Ele liga você a quem pode ajudar."
              />
              <ActionCard
                title="Lar temporário"
                description="Casa Amiga: pessoas que acolhem por um tempo."
                icon="home"
                tone="primary"
                onPress={() => router.push('/casa-amiga')}
              />
              <ActionCard
                title="Ração, remédio ou castração"
                description="Veja os pedidos e campanhas das ONGs e protetores verificados."
                icon="package"
                tone="primary"
                onPress={() => router.push('/precisa-se')}
              />
              <ActionCard
                title="É um animal da rua doente?"
                description="Publique como resgate para quem está perto ajudar."
                icon="alert-circle"
                tone="secondary"
                onPress={() => go('street')}
              />
              <ActionCard
                title="Falar com a equipe"
                description="Conte o caso e a gente orienta."
                icon="message-circle"
                tone="neutral"
                onPress={() => router.push('/support')}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Question({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.question}>
      <AppText variant="h3" accessibilityRole="header">
        {title}
      </AppText>
      {hint ? (
        <AppText variant="bodySmall" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function GuidanceCard({
  title,
  steps,
  urgent,
  call,
  callLabel,
}: {
  title: string;
  steps: Guidance[];
  urgent: boolean;
  call?: () => void;
  callLabel: string;
}) {
  const { colors } = useTheme();
  const background = urgent ? colors.errorSoft : colors.warningSoft;
  const foreground = urgent ? colors.onErrorSoft : colors.onWarningSoft;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.guidance, { backgroundColor: background }]}
    >
      <View style={styles.row}>
        <Icon name="alert-octagon" color={foreground} />
        <AppText variant="h3" accessibilityRole="header" style={{ color: foreground }}>
          {title}
        </AppText>
      </View>
      {steps.map((item, index) => (
        <View
          key={item.id}
          accessible
          accessibilityLabel={`Passo ${index + 1}: ${item.text}`}
          style={styles.stepRow}
        >
          <AppText variant="bodyStrong" style={[styles.stepNumber, { color: foreground }]}>
            {index + 1}.
          </AppText>
          <AppText variant="body" style={[styles.flex, { color: foreground }]}>
            {item.text}
          </AppText>
        </View>
      ))}
      {call ? <Button title={callLabel} icon="phone" size="lg" fullWidth onPress={call} /> : null}
    </View>
  );
}

function UrgencyPicker({
  suggested,
  value,
  reason,
  onChange,
}: {
  suggested: Urgency;
  value: Urgency;
  reason: string;
  onChange: (value: Urgency) => void;
}) {
  return (
    <View style={styles.group}>
      <Question
        title={`O Cupu sugere: ${urgencyLabel[suggested]}`}
        hint={`${reason} Você pode mudar.`}
      />
      <View style={styles.chips}>
        {urgencyChoices.map((option) => (
          <Chip
            key={option}
            label={urgencyLabel[option]}
            selected={value === option}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    </View>
  );
}

function DescriptionEditor({
  extraLabel,
  extra,
  onExtra,
  description,
  edited,
  onEdit,
  onReset,
}: {
  extraLabel: string;
  extra: string;
  onExtra: (text: string) => void;
  description: string;
  edited: boolean;
  onEdit: (text: string) => void;
  onReset: () => void;
}) {
  return (
    <View style={styles.group}>
      {edited ? null : (
        <Input
          label={extraLabel}
          value={extra}
          onChangeText={(text) => onExtra(text.slice(0, EXTRA_LIMIT))}
          multiline
        />
      )}
      <Question
        title="Como vai aparecer"
        hint="O Cupu juntou o que você marcou. Edite à vontade."
      />
      <Input label="Descrição" value={description} onChangeText={onEdit} multiline />
      {edited ? (
        <Button
          title="Voltar ao texto do Cupu"
          icon="rotate-ccw"
          variant="ghost"
          onPress={onReset}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerColumn: screenColumn,
  column: { ...screenColumn, paddingHorizontal: spacing.lg, gap: spacing.lg },
  content: { paddingTop: spacing.sm },
  hello: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  group: { gap: spacing.sm },
  question: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guidance: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  stepRow: { flexDirection: 'row', gap: spacing.sm },
  stepNumber: { minWidth: spacing.xl },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
