import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppModal, AppText, Button, Icon, type IconName } from '../components/ui';
import { Mascot } from '../mascot';
import { useSession } from '../session';
import { spacing, useTheme } from '../theme';
import { loadMyPartners } from './api';
import { usePartnerInvite } from './inviteStorage';
import { shouldInvite } from './partners';

/** Espera a pessoa olhar o mapa um pouco antes de oferecer qualquer coisa. */
const SHOW_AFTER_MS = 6000;

const perks: { icon: IconName; text: string }[] = [
  { icon: 'map-pin', text: 'Sua loja no mapa, com a casinha dos parceiros' },
  { icon: 'message-circle', text: 'Cliente chamando direto no seu WhatsApp' },
  { icon: 'heart', text: 'Sem custo: você oferece uma vantagem a quem adota' },
];

/**
 * Convite "Anuncie aqui" com o Cupu, na tela do mapa. Aparece poucas vezes (ver shouldInvite)
 * e só com a tela parada um tempinho; nunca por cima de um card de resgate aberto.
 */
export function PartnerInvite({ active }: { active: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const invite = usePartnerInvite();
  const [visible, setVisible] = useState(false);
  const mine = useQuery({
    queryKey: ['partners', 'mine', token],
    queryFn: () => loadMyPartners(token),
    enabled: Boolean(token),
  });
  const isPartner = (mine.data?.partners.length ?? 0) > 0;
  const { loaded, load, markShown } = invite;

  useEffect(() => {
    void load();
  }, [load]);

  const ready = loaded && (!token || mine.isSuccess);
  const { firstSeenAt, lastShownAt, muted } = invite;
  useEffect(() => {
    if (!active || !ready) return;
    const timer = setTimeout(() => {
      if (!shouldInvite({ firstSeenAt, lastShownAt, muted }, Date.now(), isPartner)) return;
      markShown();
      setVisible(true);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active, firstSeenAt, isPartner, lastShownAt, markShown, muted, ready]);

  return (
    <AppModal visible={visible} onClose={() => setVisible(false)}>
      <View style={styles.hero}>
        <Mascot pose="wave" size={120} />
        <AppText variant="h2" style={styles.center}>
          Tem petshop, clínica ou loja de ração?
        </AppText>
        <AppText variant="body" color="textSecondary" style={styles.center}>
          Vira Parceiro do Cupu e aparece pra quem cuida de bicho em Belém.
        </AppText>
      </View>
      <View style={styles.list}>
        {perks.map((perk) => (
          <View key={perk.text} style={styles.row}>
            <Icon name={perk.icon} color={colors.primary} />
            <AppText variant="bodySmall" style={styles.grow}>
              {perk.text}
            </AppText>
          </View>
        ))}
      </View>
      <Button
        title="Quero anunciar"
        icon="arrow-right"
        iconPosition="right"
        variant="secondary"
        fullWidth
        onPress={() => {
          setVisible(false);
          router.push('/parceiros');
        }}
      />
      <Button
        title="Não mostrar mais"
        variant="ghost"
        fullWidth
        onPress={() => {
          invite.mute();
          setVisible(false);
        }}
      />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  grow: { flex: 1 },
});
