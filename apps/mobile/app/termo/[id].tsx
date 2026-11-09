import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { looksLikeFullName, maskCpf, type AdoptionTermPage } from '../../src/adoptionTerm/term';
import { api, loadMe, loadPost, messageFrom } from '../../src/api';
import { animalHeadline } from '../../src/animalLabels';
import {
  AppText,
  Button,
  Card,
  Checkbox,
  Header,
  InfoChip,
  Input,
  Notice,
  useToast,
} from '../../src/components/ui';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/**
 * Termo de adoção. Antes da adoção é só a prévia (quem preenche a ficha já sabe o que vai
 * assinar). Depois que o animal é marcado como adotado, quem adotou lê e aceita com o nome
 * completo, e CPF e endereço quando a ONG pede. Aceito, o texto fica guardado como foi lido e
 * quem adotou e quem entregou podem compartilhar uma cópia.
 */
export default function AdoptionTermScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [typedName, setFullName] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [address, setAddress] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = useQuery({
    queryKey: ['post', id, token],
    queryFn: () => loadPost(id, token),
    enabled: Boolean(id),
  });
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const query = useQuery({
    queryKey: ['adoption-term', id, token],
    queryFn: () => api<AdoptionTermPage>(`/posts/${id}/adoption-term`, { token }),
    enabled: Boolean(id && token),
  });
  const page = query.data;
  const name = post.data ? animalHeadline(post.data.animal) : undefined;

  // O nome da conta já vem escrito; a pessoa completa com o sobrenome se faltar.
  const fullName = typedName ?? me.data?.name ?? '';

  const needsIdentity = page?.requireIdentity ?? false;
  const cpfDigits = cpf.replace(/\D/g, '');
  const ready =
    looksLikeFullName(fullName) &&
    agree &&
    (!needsIdentity || (cpfDigits.length === 11 && address.trim().length >= 5));

  async function accept() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<AdoptionTermPage>(`/posts/${id}/adoption-term`, {
        method: 'POST',
        token,
        body: {
          fullName: fullName.trim(),
          agree: true,
          ...(cpfDigits ? { cpf: cpfDigits } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
        },
      });
      client.setQueryData(['adoption-term', id, token], next);
      void client.invalidateQueries({ queryKey: ['followup', id] });
      toast.show('Termo aceito. Obrigado por adotar com responsabilidade!', 'success');
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!page) return;
    const lines = [page.text];
    if (page.accepted) {
      lines.push(
        '',
        `Aceito por ${page.accepted.fullName} em ${new Date(page.accepted.acceptedAt).toLocaleString('pt-BR')}.`,
      );
      if (page.accepted.cpf) lines.push(`CPF: ${page.accepted.cpf}`);
      if (page.accepted.address) lines.push(`Endereço: ${page.accepted.address}`);
    }
    await Share.share({ message: lines.join('\n') }).catch(() => undefined);
  }

  let body: React.ReactNode;
  if (!token) {
    body = <Notice tone="info" message="Entre na sua conta para ler o termo de adoção." />;
  } else if (query.isLoading) {
    body = <ActivityIndicator color={colors.primary} />;
  } else if (query.isError || !page) {
    body = (
      <Notice
        tone="warning"
        message={`Não consegui abrir o termo. ${messageFrom(query.error)}`}
        action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }}
      />
    );
  } else {
    body = (
      <>
        <View style={styles.chips}>
          <InfoChip
            label={page.source === 'org' ? `Termo de ${page.giverName}` : 'Termo do Égua, adota!'}
            tone="info"
          />
          {page.accepted ? <InfoChip label="Aceito" tone="success" /> : null}
        </View>

        {!page.role && !page.accepted ? (
          <Notice
            tone="info"
            message="Esta é uma prévia. Quem adotar lê e aceita o termo pelo app depois que o animal for marcado como adotado."
          />
        ) : null}
        {page.waiting ? (
          <Notice tone="info" message="Esperando quem adotou ler e aceitar o termo." />
        ) : null}

        <Card elevation="sm">
          <AppText selectable style={styles.term}>
            {page.text}
          </AppText>
        </Card>

        {page.accepted ? (
          <Card elevation="sm">
            <View style={styles.section}>
              <AppText variant="bodyStrong">
                Aceito por {page.accepted.fullName} em{' '}
                {new Date(page.accepted.acceptedAt).toLocaleString('pt-BR')}
              </AppText>
              {page.accepted.cpf ? (
                <AppText color="textSecondary">CPF: {page.accepted.cpf}</AppText>
              ) : null}
              {page.accepted.address ? (
                <AppText color="textSecondary">Endereço: {page.accepted.address}</AppText>
              ) : null}
              <AppText variant="bodySmall" color="textSecondary">
                Só quem adotou, quem entregou e a equipe do app veem estes dados.
              </AppText>
            </View>
          </Card>
        ) : null}

        {page.canAccept ? (
          <Card elevation="md">
            <View style={styles.section}>
              <AppText variant="h2">Aceitar o termo</AppText>
              <Input
                label="Seu nome completo"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
                autoCapitalize="words"
                maxLength={120}
                error={
                  fullName.trim() && !looksLikeFullName(fullName)
                    ? 'Escreva nome e sobrenome.'
                    : undefined
                }
              />
              <Input
                label={needsIdentity ? 'CPF' : 'CPF (se quiser)'}
                value={cpf}
                onChangeText={(text) => setCpf(maskCpf(text))}
                keyboardType="number-pad"
                maxLength={14}
                helper={
                  needsIdentity
                    ? `${page.giverName} pede o CPF no termo.`
                    : 'Só quem entregou o animal e a equipe veem.'
                }
              />
              {needsIdentity ? (
                <Input
                  label="Endereço onde o animal vai morar"
                  value={address}
                  onChangeText={setAddress}
                  autoComplete="street-address"
                  maxLength={240}
                  placeholder="Rua, número, bairro"
                />
              ) : null}
              <Checkbox
                label="Li o termo inteiro e concordo"
                description="Aceitar aqui vale como a sua assinatura do termo."
                checked={agree}
                onChange={setAgree}
              />
              {error ? <Notice tone="error" message={error} /> : null}
              <Button
                title="Aceitar o termo"
                icon="check"
                size="lg"
                fullWidth
                disabled={!ready}
                loading={busy}
                onPress={() => void accept()}
              />
            </View>
          </Card>
        ) : null}

        <Button
          title={page.accepted ? 'Compartilhar uma cópia' : 'Compartilhar o termo'}
          icon="share-2"
          variant="outline"
          fullWidth
          onPress={() => void share()}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header
            title="Termo de adoção"
            subtitle={name}
            onBack={() => (router.canGoBack() ? router.back() : router.replace(`/post/${id}`))}
          />
          <View style={styles.body}>{body}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  term: { lineHeight: 22 },
});

// Uma tela quebrada não derruba o app.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
