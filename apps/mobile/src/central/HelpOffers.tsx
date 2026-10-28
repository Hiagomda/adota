import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, messageFrom } from '../api';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Divider,
  InfoChip,
  Notice,
  useToast,
} from '../components/ui';
import { spacing } from '../theme';
import {
  helpOfferKinds,
  offerKindLabel,
  offerStatusLabel,
  type HelpOffer,
  type HelpOffersPage,
} from './central';
import { OfferSheet } from './OfferSheet';

const statusTone = {
  offered: 'info',
  accepted: 'success',
  declined: 'neutral',
  withdrawn: 'neutral',
} as const;

/**
 * Ofertas de ajuda no resgate: quem pode receber o animal, levar ração, pagar consulta ou
 * levar materiais. Quem publicou aceita ou recusa; quem ofereceu pode desistir.
 */
export function HelpOffers({ postId, token }: { postId: string; token: string | null }) {
  const client = useQueryClient();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const offers = useQuery({
    queryKey: ['help-offers', postId, token],
    queryFn: () => api<HelpOffersPage>(`/posts/${postId}/help-offers`, { token }),
  });
  const page = offers.data;
  if (offers.isLoading) return null;
  if (offers.isError || !page) {
    return (
      <Notice
        tone="warning"
        message={`Não consegui carregar as ofertas de ajuda. ${messageFrom(offers.error)}`}
        action={{ label: 'Tentar de novo', onPress: () => void offers.refetch() }}
      />
    );
  }
  const list = page.offers;
  if (list.length === 0 && !page.canOffer) return null;
  const mineActive = list
    .filter((offer) => offer.mine && (offer.status === 'offered' || offer.status === 'accepted'))
    .map((offer) => offer.kind);
  const allOffered = helpOfferKinds.every((kind) => mineActive.includes(kind.value));

  async function decide(offer: HelpOffer, decision: 'accept' | 'decline' | 'withdraw') {
    if (busy) return;
    setBusy(offer.id);
    try {
      await api(`/help-offers/${offer.id}/${decision}`, { method: 'POST', token });
      await client.invalidateQueries({ queryKey: ['help-offers', postId] });
      toast.show(
        decision === 'accept'
          ? 'Oferta aceita. Combinem pelos comentários.'
          : decision === 'decline'
            ? 'Avisamos que não precisa agora.'
            : 'Oferta retirada.',
        'success',
      );
    } catch (failure) {
      toast.show(messageFrom(failure), 'error');
      void offers.refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.section}>
      <AppText variant="h2">Outras ajudas</AppText>
      {list.length === 0 ? (
        <AppText color="textSecondary">
          Ninguém ofereceu lar, ração, veterinário ou materiais ainda.
        </AppText>
      ) : (
        <Card padding="none" elevation="sm">
          {list.map((offer, index) => (
            <View key={offer.id}>
              {index > 0 ? <Divider inset /> : null}
              <View style={styles.row}>
                <Avatar name={offer.person.name} uri={offer.person.avatarUrl} size="sm" />
                <View style={styles.rowText}>
                  <AppText variant="bodySmallStrong">
                    {offer.mine ? 'Você' : offer.person.name} · {offerKindLabel(offer.kind)}
                  </AppText>
                  {offer.note ? (
                    <AppText variant="bodySmall" color="textSecondary">
                      {offer.note}
                    </AppText>
                  ) : null}
                  <View style={styles.pill}>
                    <InfoChip
                      label={offerStatusLabel[offer.status]}
                      tone={statusTone[offer.status]}
                    />
                  </View>
                  {page.canDecide && offer.status === 'offered' ? (
                    <View style={styles.actions}>
                      <Button
                        title="Aceitar"
                        icon="check"
                        loading={busy === offer.id}
                        onPress={() => void decide(offer, 'accept')}
                      />
                      <Button
                        title="Não precisa"
                        variant="ghost"
                        disabled={busy === offer.id}
                        onPress={() => void decide(offer, 'decline')}
                      />
                    </View>
                  ) : null}
                  {offer.mine && (offer.status === 'offered' || offer.status === 'accepted') ? (
                    <View style={styles.actions}>
                      <Button
                        title="Não vou poder"
                        variant="ghost"
                        loading={busy === offer.id}
                        onPress={() => void decide(offer, 'withdraw')}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}
      {page.canOffer && token && !allOffered ? (
        <Button
          title="Oferecer outra ajuda"
          icon="gift"
          variant="outline"
          fullWidth
          onPress={() => setSheetOpen(true)}
        />
      ) : null}
      <OfferSheet
        visible={sheetOpen}
        postId={postId}
        token={token}
        already={mineActive}
        onClose={() => setSheetOpen(false)}
        onSent={async () => {
          setSheetOpen(false);
          toast.show('Oferta enviada. Quem cuida do resgate vai responder.', 'success');
          await client.invalidateQueries({ queryKey: ['help-offers', postId] });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  rowText: { flex: 1, gap: spacing.xs },
  pill: { flexDirection: 'row' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
});
