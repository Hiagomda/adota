import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, Icon, Touchable, type IconName } from '../components/ui';
import { useViewerLocation } from '../place/deviceLocation';
import { radius, spacing, useTheme } from '../theme';
import { loadSpotlight } from './api';
import { partnerKindIcons } from './partners';

/**
 * Cartão "Parceiro do bem" entre as publicações: um destaque escolhido pela equipe, perto de
 * quem vê, sempre marcado como anúncio. Sem parceiro em destaque, não ocupa espaço nenhum.
 */
export function PartnerSpotlight({ slot = 0 }: { slot?: number }) {
  const router = useRouter();
  const { colors } = useTheme();
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
    <Card padding="md">
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`Anúncio: ${partner.name}. ${partner.perk}`}
        pressedScale={0.99}
        onPress={() => router.push(`/parceiro/${partner.id}`)}
        style={styles.row}
      >
        <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={partnerKindIcons[partner.kind] as IconName} color={colors.onPrimarySoft} />
        </View>
        <View style={styles.text}>
          <AppText variant="caption" color="textSecondary">
            Anúncio · Parceiro do bem
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {partner.name}
          </AppText>
          <View style={styles.perk}>
            <Icon name="gift" size="sm" color={colors.onSecondarySoft} />
            <AppText
              variant="bodySmall"
              numberOfLines={2}
              style={[styles.grow, { color: colors.onSecondarySoft }]}
            >
              {partner.perk}
            </AppText>
          </View>
        </View>
        <Icon name="chevron-right" color={colors.textSecondary} />
      </Touchable>
    </Card>
  );
}

const ICON = 48;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
  perk: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  grow: { flex: 1 },
});
