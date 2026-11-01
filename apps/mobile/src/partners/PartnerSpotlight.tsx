import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Icon, Touchable, type IconName } from '../components/ui';
import { useViewerLocation } from '../place/deviceLocation';
import { radius, spacing, useTheme } from '../theme';
import { loadSpotlight } from './api';
import { PartnerBanner, PartnerPin } from './PartnerArt';
import { partnerKindIcons } from './partners';

/**
 * Cartão "Parceiro do bem" entre as publicações: um destaque escolhido pela equipe, perto de
 * quem vê, sempre marcado como anúncio. Sem parceiro em destaque, não ocupa espaço nenhum.
 */
export function PartnerSpotlight({ slot = 0 }: { slot?: number }) {
  const router = useRouter();
  const { colors, shadows } = useTheme();
  const here = useViewerLocation();
  // Arredonda a posição: andar uns metros não pede a lista de novo.
  const near = here
    ? { latitude: Number(here.latitude.toFixed(2)), longitude: Number(here.longitude.toFixed(2)) }
    : null;
  const spotlight = useQuery({
    queryKey: ['partners', 'spotlight', near?.latitude, near?.longitude],
    queryFn: () => loadSpotlight(near),
    staleTime: 10 * 60 * 1000,
  });
  const list = spotlight.data?.partners ?? [];
  const partner = list.length > 0 ? list[slot % list.length] : undefined;
  if (!partner) return null;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`Anúncio: ${partner.name}. ${partner.perk}`}
      pressedScale={0.98}
      onPress={() => router.push(`/parceiro/${partner.id}`)}
      style={[styles.card, shadows.md, { backgroundColor: colors.surfaceRaised }]}
    >
      <PartnerBanner rounded={0} style={styles.side}>
        <View style={styles.sideInner}>
          <PartnerPin size={64} />
          <AppText variant="caption" style={[styles.sideText, { color: colors.onHero }]}>
            PARCEIRO{'\n'}DO CUPU
          </AppText>
        </View>
      </PartnerBanner>
      <View style={styles.text}>
        <View style={styles.topRow}>
          <View style={[styles.ad, { borderColor: colors.border }]}>
            <AppText variant="caption" color="textSecondary">
              Anúncio
            </AppText>
          </View>
          <Icon
            name={partnerKindIcons[partner.kind] as IconName}
            size="sm"
            color={colors.textSecondary}
          />
          <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.grow}>
            {partner.kindLabel}
          </AppText>
        </View>
        <AppText variant="h3" numberOfLines={1}>
          {partner.name}
        </AppText>
        <View style={[styles.perk, { backgroundColor: colors.secondarySoft }]}>
          <Icon name="gift" size="sm" color={colors.onSecondarySoft} />
          <AppText
            variant="bodySmallStrong"
            numberOfLines={2}
            style={[styles.grow, { color: colors.onSecondarySoft }]}
          >
            {partner.perk}
          </AppText>
        </View>
        <View style={styles.more}>
          <AppText variant="bodySmallStrong" color="primary">
            Ver parceiro
          </AppText>
          <Icon name="arrow-right" size="sm" color={colors.primary} />
        </View>
      </View>
    </Touchable>
  );
}

const SIDE = 104;

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: radius.xl, overflow: 'hidden' },
  side: { width: SIDE },
  sideInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  sideText: { textAlign: 'center', letterSpacing: 1, fontWeight: '700' },
  text: { flex: 1, gap: spacing.sm, padding: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ad: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    marginRight: spacing.xs,
  },
  perk: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  more: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  grow: { flex: 1 },
});
