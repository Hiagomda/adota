import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadMe, messageFrom } from '../../src/api';
import { BannerPicker } from '../../src/campaign/BannerPicker';
import {
  campaignFormError,
  parseMoneyInput,
  type CampaignBannerColor,
} from '../../src/campaign/campaign';
import {
  AppText,
  Button,
  Header,
  Input,
  Notice,
  SkeletonRows,
  useToast,
} from '../../src/components/ui';
import { belemToday, newClientKey, parseDayInput } from '../../src/passport/passport';
import { isTeamRole, useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/** Abrir campanha. Vem do passaporte ou do caso com o animal já ligado. */
export default function NewCampaignScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ animalId?: string; postId?: string; nome?: string }>();
  const token = useSession((state) => state.token);
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const [title, setTitle] = useState(params.nome ? `Ajude ${params.nome}` : '');
  const [purpose, setPurpose] = useState('');
  const [goal, setGoal] = useState('');
  const [deadline, setDeadline] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [bannerColor, setBannerColor] = useState<CampaignBannerColor>('coral');
  const [bannerKey, setBannerKey] = useState<string | null>(null);
  const [clientKey] = useState(newClientKey);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Qualquer conta pede; a equipe aprova antes de ir ao ar. Só a própria equipe publica direto.
  const team = Boolean(me.data && isTeamRole(me.data.role));

  async function create() {
    if (saving) return;
    const goalCents = parseMoneyInput(goal);
    const day = parseDayInput(deadline);
    const problem = campaignFormError({
      title,
      purpose,
      goalCents,
      deadline: day,
      pixKey,
      today: belemToday(),
    });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api<{ id: string; reviewStatus?: string }>('/campaigns', {
        method: 'POST',
        token,
        body: {
          title: title.trim(),
          purpose: purpose.trim(),
          goalCents,
          deadline: day,
          pixKey: pixKey.trim(),
          animalId: params.animalId || undefined,
          postId: params.postId || undefined,
          bannerColor,
          bannerKey: bannerKey ?? undefined,
          clientKey,
        },
      });
      await client.invalidateQueries({ queryKey: ['campaigns'] });
      toast.show(
        created.reviewStatus === 'pending'
          ? 'Pedido enviado. A equipe confere e avisa você.'
          : 'Campanha aberta.',
        'success',
      );
      router.replace(`/campanha/${created.id}`);
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.column}>
        <Header
          title={team || !me.data ? 'Abrir campanha' : 'Pedir campanha'}
          onBack={() => router.back()}
        />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.giant }]}
      >
        <View style={styles.column}>
          {!token ? (
            <Button
              title="Entrar para abrir campanha"
              icon="log-in"
              fullWidth
              onPress={() =>
                router.push({ pathname: '/login', params: { returnTo: '/campanhas' } })
              }
            />
          ) : me.isLoading ? (
            <SkeletonRows />
          ) : (
            <View style={styles.form}>
              {team ? null : (
                <Notice
                  tone="info"
                  message="A equipe do Égua, adota! confere cada campanha antes de ela aparecer no app. Você recebe um aviso quando for aprovada."
                />
              )}
              {params.animalId || params.postId ? (
                <Notice
                  tone="info"
                  message="A campanha fica ligada a este animal e aparece no passaporte dele."
                />
              ) : null}
              <Input
                label="Título"
                placeholder="Ex.: Cirurgia da pata da Mel"
                value={title}
                onChangeText={setTitle}
                maxLength={80}
              />
              <Input
                label="Para que é o dinheiro"
                placeholder="O que aconteceu, o que vai ser pago e como chegou nesse valor (orçamento da clínica, preço da ração)."
                value={purpose}
                onChangeText={setPurpose}
                multiline
                maxLength={2000}
              />
              <Input
                label="Meta (R$)"
                placeholder="1.500,00"
                value={goal}
                onChangeText={setGoal}
                keyboardType="decimal-pad"
                maxLength={16}
              />
              <Input
                label="Último dia (dia/mês/ano)"
                placeholder="30/11/2026"
                value={deadline}
                onChangeText={setDeadline}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                helper="Até um ano. Depois do prazo o Pix sai da campanha."
              />
              <Input
                label="Chave Pix"
                placeholder="E-mail, telefone, CNPJ ou aleatória"
                value={pixKey}
                onChangeText={setPixKey}
                autoCapitalize="none"
                maxLength={120}
                helper="O pagamento acontece fora do app, direto para você."
              />
              <BannerPicker
                token={token}
                color={bannerColor}
                onColor={setBannerColor}
                bannerKey={bannerKey}
                onBanner={setBannerKey}
                onError={setError}
              />
              <AppText variant="bodySmall" color="textSecondary">
                O progresso só soma o que você confirmar com comprovante. Lance também as despesas
                com nota ou recibo: quem doou acompanha tudo no extrato e no histórico.
              </AppText>
              {error ? <Notice tone="error" message={error} /> : null}
              <Button
                title={team ? 'Abrir campanha' : 'Pedir aprovação'}
                icon="heart"
                size="lg"
                fullWidth
                loading={saving}
                onPress={() => void create()}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: screenColumn,
  content: { padding: spacing.lg },
  form: { gap: spacing.lg },
});

export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
