import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Header,
  Input,
  Notice,
  SkeletonRows,
} from '../src/components/ui';
import { formatWhen } from '../src/format';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

type Kind = 'ngo' | 'protector';

interface VerificationStatus {
  verified: boolean;
  role: string;
  request: {
    status: 'pending' | 'approved' | 'rejected';
    kind: Kind;
    organizationName: string;
    createdAt: string;
    decidedAt: string | null;
  } | null;
}

const kinds: { value: Kind; label: string }[] = [
  { value: 'ngo', label: 'ONG ou coletivo' },
  { value: 'protector', label: 'Protetor independente' },
];

const NOTE_MAX = 500;

/** Cadastro de ONG ou protetor: o pedido vai para a equipe, que confere antes de dar o selo. */
export default function NgoSignupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [kind, setKind] = useState<Kind>('ngo');
  const [name, setName] = useState('');
  const [instagram, setInstagram] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const status = useQuery({
    queryKey: ['verification', token],
    queryFn: () => api<VerificationStatus>('/me/verification', { token }),
    enabled: Boolean(token),
  });

  async function send() {
    if (!token) return;
    setSending(true);
    setMessage(null);
    try {
      await api('/me/verification', {
        method: 'POST',
        token,
        body: {
          kind,
          organizationName: name.trim(),
          ...(instagram.trim() ? { instagram: instagram.trim() } : {}),
          ...(kind === 'ngo' && cnpj.trim() ? { cnpj: cnpj.trim() } : {}),
          ...(neighborhood.trim() ? { neighborhood: neighborhood.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      await client.invalidateQueries({ queryKey: ['verification'] });
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setSending(false);
    }
  }

  const current = status.data;
  const pending = current?.request?.status === 'pending';
  const rejected = current?.request?.status === 'rejected';
  const canSend = name.trim().length >= 2 && note.trim().length >= 10;

  let body;
  if (!token) {
    body = (
      <EmptyState
        pose="wave"
        title="Entre para se cadastrar"
        body="O cadastro de ONG ou protetor fica ligado à sua conta."
        actionLabel="Entrar"
        onAction={() => router.push('/login')}
      />
    );
  } else if (status.isLoading) {
    body = <SkeletonRows />;
  } else if (status.isError) {
    body = (
      <ErrorState
        title="Não consegui ver seu cadastro"
        body={messageFrom(status.error)}
        onRetry={() => void status.refetch()}
      />
    );
  } else if (current?.verified) {
    body = (
      <Card elevation="none" style={{ backgroundColor: colors.successSoft }}>
        <View style={styles.box}>
          <AppText variant="h3" style={{ color: colors.onSuccessSoft }}>
            Seu perfil é verificado
          </AppText>
          <AppText style={{ color: colors.onSuccessSoft }}>
            O selo aparece no seu perfil e nos seus posts. Você pode divulgar o Pix nos pedidos de
            ajuda e marcar feiras de adoção.
          </AppText>
          <Button
            title="Abrir o painel da ONG"
            icon="grid"
            onPress={() => router.push('/painel-ong')}
          />
          <Button
            title="Divulgar uma feira"
            icon="calendar"
            variant="outline"
            onPress={() =>
              router.push({ pathname: '/agenda/novo', params: { categoria: 'adoption_fair' } })
            }
          />
        </View>
      </Card>
    );
  } else if (pending && current?.request) {
    body = (
      <Card elevation="none" style={{ backgroundColor: colors.infoSoft }}>
        <View style={styles.box}>
          <AppText variant="h3" style={{ color: colors.onInfoSoft }}>
            Pedido na fila da equipe
          </AppText>
          <AppText style={{ color: colors.onInfoSoft }}>
            Recebemos o cadastro de {current.request.organizationName}{' '}
            {formatWhen(current.request.createdAt)}. A equipe confere o Instagram e os dados, e você
            recebe um aviso em Alertas quando terminar.
          </AppText>
        </View>
      </Card>
    );
  } else {
    body = (
      <View style={styles.form}>
        {rejected ? (
          <Notice
            tone="warning"
            message="A equipe não conseguiu confirmar o último pedido. Confira os dados e conte um pouco mais sobre o trabalho."
          />
        ) : null}
        <AppText variant="bodyStrong">Você é</AppText>
        <View style={styles.wrap}>
          {kinds.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={kind === option.value}
              onPress={() => setKind(option.value)}
            />
          ))}
        </View>
        <Input
          label={kind === 'ngo' ? 'Nome da ONG ou coletivo' : 'Seu nome de protetor'}
          value={name}
          onChangeText={setName}
          placeholder={kind === 'ngo' ? 'Ex.: Patas de Belém' : 'Ex.: Maria dos Gatos do Guamá'}
          maxLength={120}
        />
        <Input
          label="Instagram (se tiver)"
          value={instagram}
          onChangeText={setInstagram}
          placeholder="@seuperfil"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={60}
          helper="É por onde a equipe confere o trabalho de vocês."
        />
        {kind === 'ngo' ? (
          <Input
            label="CNPJ (se tiver)"
            value={cnpj}
            onChangeText={setCnpj}
            placeholder="00.000.000/0000-00"
            keyboardType="number-pad"
            maxLength={20}
          />
        ) : null}
        <Input
          label="Bairro onde atuam"
          value={neighborhood}
          onChangeText={setNeighborhood}
          placeholder="Ex.: Guamá, Marco, Icoaraci"
          maxLength={80}
        />
        <Input
          label="Conte o que vocês fazem"
          value={note}
          onChangeText={setNote}
          placeholder="Quantos animais cuidam, há quanto tempo, como fazem as adoções"
          multiline
          maxLength={NOTE_MAX}
          helper={`${note.length}/${NOTE_MAX}`}
        />
        {message ? <Notice tone="error" message={message} /> : null}
        <Button
          title="Mandar para a equipe"
          icon="shield"
          variant="secondary"
          size="lg"
          fullWidth
          loading={sending}
          disabled={!canSend}
          onPress={() => void send()}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header title="ONG ou protetor" large onBack={() => router.back()} />
          <View style={styles.body}>
            <AppText color="textSecondary">
              Com o selo de verificado, seu perfil pode divulgar o Pix nos pedidos de ajuda e marcar
              feiras de adoção. O app nunca recebe dinheiro.
            </AppText>
            {body}
          </View>
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
  form: { gap: spacing.md },
  box: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
