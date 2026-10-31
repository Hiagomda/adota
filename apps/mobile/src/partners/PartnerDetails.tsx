import { Linking, StyleSheet, View } from 'react-native';
import { formatWhatsApp, whatsappUrl } from '../contact/whatsapp';
import { logBestEffort } from '../crash/bestEffort';
import { distanceLabel } from '../format';
import { AppText, Badge, Button, Icon, type IconName } from '../components/ui';
import { useViewerLocation } from '../place/deviceLocation';
import { useSession } from '../session';
import { radius, spacing, useTheme } from '../theme';
import { countPartnerTap } from './api';
import { partnerGreeting, partnerKindIcons, routeUrl, type Partner } from './partners';

/**
 * O miolo do cartão de um parceiro: tipo, vantagem em destaque, horário, endereço e os botões
 * de WhatsApp e rota. Usado no mapa e na tela do parceiro.
 */
export function PartnerDetails({
  partner,
  compact = false,
}: {
  partner: Partner;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const here = useViewerLocation();
  const distance = distanceLabel(here, partner.location);

  function open(kind: 'whatsapp' | 'route', url: string) {
    countPartnerTap(partner.id, kind, token);
    void Linking.openURL(url).catch(logBestEffort(`partners:open-${kind}`));
  }

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <View style={[styles.kindIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name={partnerKindIcons[partner.kind] as IconName} color={colors.onPrimarySoft} />
        </View>
        <View style={styles.title}>
          <AppText variant="h3" numberOfLines={2}>
            {partner.name}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary">
            {[partner.kindLabel, distance].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        <Badge kind="label" label="Parceiro" tone="primary" />
      </View>

      <View style={[styles.perk, { backgroundColor: colors.secondarySoft }]}>
        <Icon name="gift" color={colors.onSecondarySoft} />
        <View style={styles.perkText}>
          <AppText variant="caption" style={{ color: colors.onSecondarySoft }}>
            Vantagem para quem adota ou resgata
          </AppText>
          <AppText variant="bodyStrong" style={{ color: colors.onSecondarySoft }}>
            {partner.perk}
          </AppText>
        </View>
      </View>

      {!compact && partner.about ? <AppText variant="body">{partner.about}</AppText> : null}

      <View style={styles.facts}>
        {partner.hours ? <Fact icon="clock" text={partner.hours} /> : null}
        <Fact icon="map-pin" text={partner.addressText} />
        {!compact && partner.instagram ? (
          <Fact icon="instagram" text={`@${partner.instagram}`} />
        ) : null}
        {!compact ? <Fact icon="phone" text={formatWhatsApp(partner.whatsapp)} /> : null}
      </View>

      <View style={styles.actions}>
        <Button
          title="WhatsApp"
          icon="message-circle"
          onPress={() => open('whatsapp', whatsappUrl(partner.whatsapp, partnerGreeting(partner)))}
          style={styles.grow}
        />
        <Button
          title="Rota"
          icon="navigation"
          variant="outline"
          onPress={() => open('route', routeUrl(partner.location))}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size="sm" color={colors.textSecondary} />
      <AppText variant="bodySmall" color="textSecondary" style={styles.grow}>
        {text}
      </AppText>
    </View>
  );
}

const KIND_ICON = 44;

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kindIcon: {
    width: KIND_ICON,
    height: KIND_ICON,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, gap: spacing.xs },
  perk: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  perkText: { flex: 1, gap: spacing.xs },
  facts: { gap: spacing.xs },
  fact: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
});
