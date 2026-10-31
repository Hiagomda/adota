import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { AppText, Button, Icon, Touchable, type IconName } from '../components/ui';
import { useOverlay } from '../components/ui/useOverlay';
import { Mascot } from '../mascot';
import { useSession } from '../session';
import { radius, spacing, useTheme } from '../theme';
import { loadMyPartners } from './api';
import { usePartnerInvite } from './inviteStorage';
import { PartnerBanner } from './PartnerArt';
import { shouldInvite } from './partners';

/** Espera a pessoa olhar o mapa um pouco antes de oferecer qualquer coisa. */
const SHOW_AFTER_MS = 6000;

const perks: { icon: IconName; text: string }[] = [
  { icon: 'map-pin', text: 'Sua loja no mapa com a casinha turquesa dos parceiros' },
  { icon: 'message-circle', text: 'Cliente chamando direto no seu WhatsApp' },
  { icon: 'gift', text: 'Sem custo: você oferece uma vantagem a quem adota' },
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

  const close = () => setVisible(false);

  return (
    <InviteModal visible={visible} onClose={close}>
      <PartnerBanner rounded={0} style={styles.banner}>
        <View style={styles.closeRow}>
          <View style={[styles.flag, { backgroundColor: colors.heroGlass }]}>
            <AppText variant="caption" style={[styles.flagText, { color: colors.onHero }]}>
              ANUNCIE AQUI · GRÁTIS
            </AppText>
          </View>
          <Touchable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            onPress={close}
            style={[styles.close, { backgroundColor: colors.heroGlass }]}
          >
            <Icon name="x" color={colors.onHero} />
          </Touchable>
        </View>
        <View style={styles.bannerBody}>
          <View style={styles.bannerText}>
            <AppText variant="h2" style={{ color: colors.onHero }}>
              Tem petshop, clínica ou loja de ração?
            </AppText>
            <AppText variant="bodySmall" style={{ color: colors.onHeroMuted }}>
              Bota tua loja no mapa de quem cuida de bicho em Belém.
            </AppText>
          </View>
          <Mascot pose="map" size={112} />
        </View>
      </PartnerBanner>
      <View style={styles.content}>
        {perks.map((perk) => (
          <View key={perk.text} style={styles.row}>
            <View style={[styles.perkIcon, { backgroundColor: colors.primarySoft }]}>
              <Icon name={perk.icon} color={colors.onPrimarySoft} />
            </View>
            <AppText variant="bodySmall" style={styles.grow}>
              {perk.text}
            </AppText>
          </View>
        ))}
        <Button
          title="Quero ser Parceiro do Cupu"
          icon="arrow-right"
          iconPosition="right"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => {
            close();
            router.push('/parceiros');
          }}
        />
        <Button
          title="Não mostrar mais"
          variant="ghost"
          fullWidth
          onPress={() => {
            invite.mute();
            close();
          }}
        />
      </View>
    </InviteModal>
  );
}

/** Modal próprio: a faixa turquesa vai de ponta a ponta, sem o respiro do AppModal. */
function InviteModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors, shadows } = useTheme();
  const { mounted, progress } = useOverlay(visible);
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const card = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [24, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.94, 1]) },
    ],
  }));
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdrop]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.card, shadows.lg, { backgroundColor: colors.surfaceRaised }, card]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const CLOSE = 36;
const PERK_ICON = 36;

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.xl, overflow: 'hidden' },
  banner: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  closeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flag: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  flagText: { letterSpacing: 1, fontWeight: '700' },
  close: {
    width: CLOSE,
    height: CLOSE,
    borderRadius: CLOSE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bannerText: { flex: 1, gap: spacing.xs, paddingBottom: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  perkIcon: {
    width: PERK_ICON,
    height: PERK_ICON,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1 },
});
