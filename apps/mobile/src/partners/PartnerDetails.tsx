import { Linking, StyleSheet, View } from 'react-native';
import { formatWhatsApp, whatsappUrl } from '../contact/whatsapp';
import { logBestEffort } from '../crash/bestEffort';
import { distanceLabel } from '../format';
import { AppText, Button, Icon, type IconName } from '../components/ui';
import { useViewerLocation } from '../place/deviceLocation';
import { useSession } from '../session';
import { radius, spacing, useTheme } from '../theme';
import { countPartnerTap } from './api';
import { PartnerPin, PerkTicket } from './PartnerArt';
import { partnerGreeting, partnerKindIcons, routeUrl, type Partner } from './partners';

/**
 * O miolo do cartão de um parceiro: tipo, vantagem em destaque, horário, endereço e os botões
 * de WhatsApp e rota. Usado no mapa e na tela do parceiro.
 */
export function PartnerDetails({
  partner,
  compact = false,
  preview = false,
}: {
  partner: Partner;
  compact?: boolean;
  /** Exemplo na tela "Anuncie aqui" e prévia do formulário: botões sem ação e sem contagem. */
  preview?: boolean;
}) {
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const here = useViewerLocation();
  const distance = preview ? '' : distanceLabel(here, partner.location);

  function open(kind: 'whatsapp' | 'route', url: string) {
    if (preview) return;
    countPartnerTap(partner.id, kind, token);
    void Linking.openURL(url).catch(logBestEffort(`partners:open-${kind}`));
  }

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <View style={[styles.pinWrap, { backgroundColor: colors.primarySoft }]}>
          <PartnerPin size={44} />
        </View>
        <View style={styles.title}>
          <View style={styles.seal}>
            <Icon name="award" size="sm" color={colors.primary} />
            <AppText variant="caption" style={[styles.sealText, { color: colors.primary }]}>
              PARCEIRO DO CUPU
            </AppText>
          </View>
          <AppText variant="h3" numberOfLines={2}>
            {partner.name}
          </AppText>
          <View style={styles.tags}>
            <View style={[styles.tag, { backgroundColor: colors.surfaceMuted }]}>
              <Icon
                name={partnerKindIcons[partner.kind] as IconName}
                size="sm"
                color={colors.textSecondary}
              />
              <AppText variant="caption" color="textSecondary">
                {partner.kindLabel}
              </AppText>
            </View>
            {distance ? (
              <View style={[styles.tag, { backgroundColor: colors.surfaceMuted }]}>
                <Icon name="navigation-2" size="sm" color={colors.textSecondary} />
                <AppText variant="caption" color="textSecondary">
                  {distance.replace(/^a cerca de /, '')}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <PerkTicket perk={partner.perk} compact={compact} />

      {!compact && partner.about ? <AppText variant="body">{partner.about}</AppText> : null}

      <View style={[styles.facts, { borderColor: colors.border }]}>
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

const PIN_WRAP = 60;

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pinWrap: {
    width: PIN_WRAP,
    height: PIN_WRAP,
    borderRadius: PIN_WRAP / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, gap: spacing.xs },
  seal: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sealText: { letterSpacing: 1, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  facts: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  fact: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
});
