import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import {
  AppText,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  Divider,
  Input,
  Notice,
  Switch,
} from '../components/ui';
import { spacing } from '../theme';
import { offerLabels, optionSummary, stayStatusLabels, type FosterOption } from './fosterHome';

const dayChoices = [3, 7, 15, 30];

/**
 * Casas Amigas com vaga para este resgate. O servidor só manda a lista para quem publicou, a
 * equipe e quem disse "vou ajudar", sem endereço: só a distância em km inteiros.
 */
export function FosterHomesSection({
  postId,
  token,
  onTalk,
  onMessage,
}: {
  postId: string;
  token: string | null;
  onTalk: (home: FosterOption) => void;
  onMessage: (message: string) => void;
}) {
  const client = useQueryClient();
  const [asking, setAsking] = useState<FosterOption | null>(null);
  const [session, setSession] = useState(0);
  const options = useQuery({
    queryKey: ['foster-options', postId, token],
    queryFn: () =>
      api<{ needsHome: boolean; homes: FosterOption[] }>(`/posts/${postId}/foster-options`, {
        token,
      }),
    enabled: Boolean(token),
  });
  const homes = options.data?.homes ?? [];
  if (homes.length === 0) return null;
  const needsHome = options.data?.needsHome ?? false;

  return (
    <View style={styles.section}>
      <AppText variant="h2">Casas Amigas</AppText>
      <AppText color="textSecondary">
        Lares temporários com vaga perto daqui. Peça pelo app; o endereço vocês combinam depois do
        aceite.
      </AppText>
      <Card padding="none" elevation="md">
        {homes.map((home, index) => (
          <View key={home.id}>
            {index > 0 ? <Divider inset /> : null}
            <View style={styles.home}>
              <Avatar name={home.name} uri={home.avatarUrl} verified={home.verified} />
              <View style={styles.homeText}>
                <AppText variant="bodyStrong">{home.name}</AppText>
                <AppText variant="bodySmall" color="textSecondary">
                  {optionSummary(home)}
                </AppText>
                <View style={styles.badges}>
                  {home.acceptsSpecialNeeds ? (
                    <Badge kind="label" label="Aceita cuidados especiais" tone="info" />
                  ) : null}
                  {home.offers.map((offer) => (
                    <Badge key={offer} kind="label" label={offerLabels[offer]} tone="neutral" />
                  ))}
                  {home.myRequest ? (
                    <Badge
                      kind="label"
                      label={stayStatusLabels[home.myRequest.status]}
                      tone={home.myRequest.status === 'approved' ? 'success' : 'warning'}
                    />
                  ) : null}
                </View>
                {home.notes ? <AppText variant="bodySmall">“{home.notes}”</AppText> : null}
                <View style={styles.actions}>
                  {needsHome && !home.myRequest && home.freeSlots > 0 ? (
                    <Button
                      title="Pedir acolhimento"
                      icon="home"
                      variant="secondary"
                      onPress={() => {
                        setSession((value) => value + 1);
                        setAsking(home);
                      }}
                    />
                  ) : null}
                  {home.hasWhatsApp ? (
                    <Button
                      title="WhatsApp"
                      icon="message-circle"
                      variant="ghost"
                      onPress={() => onTalk(home)}
                    />
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        ))}
      </Card>
      <RequestSheet
        key={session}
        home={asking}
        postId={postId}
        token={token}
        onClose={() => setAsking(null)}
        onSent={async () => {
          setAsking(null);
          await client.invalidateQueries({ queryKey: ['foster-options', postId] });
          await client.invalidateQueries({ queryKey: ['casa-amiga'] });
          onMessage('Pedido enviado. A Casa Amiga recebe o aviso e responde pelo app.');
        }}
      />
    </View>
  );
}

function RequestSheet({
  home,
  postId,
  token,
  onClose,
  onSent,
}: {
  home: FosterOption | null;
  postId: string;
  token: string | null;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [days, setDays] = useState<number | null>(7);
  const [specialCare, setSpecialCare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!home || sending) return;
    if (message.trim().length < 5) {
      setError('Conte em poucas palavras como o animal está e do que precisa.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api(`/posts/${postId}/foster-requests`, {
        method: 'POST',
        token,
        body: {
          fosterId: home.id,
          message: message.trim(),
          expectedDays: days ?? undefined,
          specialCare,
        },
      });
      await onSent();
    } catch (failure) {
      setError(messageFrom(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <BottomSheet
      visible={home !== null}
      onClose={onClose}
      title={home ? `Pedir para ${home.name.split(' ')[0]}` : undefined}
    >
      <View style={styles.sheet}>
        <Input
          label="Recado"
          placeholder="Ex.: está assustado mas é dócil, já tomou vermífugo"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={300}
        />
        <AppText variant="h3">Por quanto tempo, mais ou menos</AppText>
        <View style={styles.chips}>
          {dayChoices.map((value) => (
            <Chip
              key={value}
              label={`${value} dias`}
              selected={days === value}
              onPress={() => setDays(days === value ? null : value)}
            />
          ))}
        </View>
        {home?.acceptsSpecialNeeds ? (
          <Switch
            label="Precisa de cuidados especiais"
            description="Remédio em horário, pós-cirurgia, curativo."
            value={specialCare}
            onValueChange={setSpecialCare}
          />
        ) : null}
        {error ? <Notice tone="error" message={error} /> : null}
        <Button title="Enviar pedido" fullWidth loading={sending} onPress={() => void send()} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  home: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  homeText: { flex: 1, gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheet: { gap: spacing.md, paddingBottom: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
