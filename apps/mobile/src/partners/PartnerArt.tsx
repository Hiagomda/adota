import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText, HeroSurface, Icon, PetPattern } from '../components/ui';
import { partnerPinSource } from '../map/paw';
import { radius, spacing, useTheme } from '../theme';

/** Faixa turquesa com a textura de ossinho e peixinho, a mesma da entrada do app. */
export function PartnerBanner({
  children,
  style,
  rounded = radius.xl,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
}) {
  const { colors } = useTheme();
  return (
    <HeroSurface curved={false} style={[{ borderRadius: rounded, overflow: 'hidden' }, style]}>
      <PetPattern color={colors.onHero} opacity={0.12} />
      {children}
    </HeroSurface>
  );
}

/** A casinha dos parceiros, a mesma do mapa. */
export function PartnerPin({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={partnerPinSource}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * A vantagem como um cupom destacável: fundo coral claro, picote tracejado e os dois recortes
 * redondos nas laterais. É o que o parceiro oferece em troca de aparecer no app.
 */
export function PerkTicket({
  perk,
  compact = false,
  notchColor,
}: {
  perk: string;
  compact?: boolean;
  /** Cor do fundo atrás do cupom, para os recortes laterais parecerem furos. */
  notchColor?: string;
}) {
  const { colors } = useTheme();
  const hole = notchColor ?? colors.surfaceRaised;
  return (
    <View style={[styles.ticket, { backgroundColor: colors.secondarySoft }]}>
      <View style={styles.stub}>
        <View style={[styles.gift, { backgroundColor: colors.secondary }]}>
          <Icon name="gift" color={colors.onSecondary} />
        </View>
      </View>
      {/* Picote desenhado com tracinhos: borda tracejada de um lado só falha no Android. */}
      <View style={styles.perforation}>
        {Array.from({ length: DASHES }, (_, index) => (
          <View key={index} style={[styles.dash, { backgroundColor: colors.secondary }]} />
        ))}
      </View>
      <View style={styles.ticketText}>
        <AppText variant="caption" style={[styles.kicker, { color: colors.onSecondarySoft }]}>
          VANTAGEM DO CUPU
        </AppText>
        <AppText
          variant={compact ? 'bodySmallStrong' : 'bodyStrong'}
          numberOfLines={compact ? 2 : undefined}
          style={{ color: colors.onSecondarySoft }}
        >
          {perk}
        </AppText>
      </View>
      <View style={[styles.notch, styles.notchTop, { backgroundColor: hole }]} />
      <View style={[styles.notch, styles.notchBottom, { backgroundColor: hole }]} />
    </View>
  );
}

const GIFT = 40;
const NOTCH = 16;
const STUB = GIFT + spacing.md * 2;
const DASHES = 8;

const styles = StyleSheet.create({
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  stub: {
    width: STUB,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  perforation: {
    alignSelf: 'stretch',
    justifyContent: 'space-evenly',
    paddingVertical: NOTCH / 2,
    overflow: 'hidden',
  },
  dash: { width: 2, height: 5, borderRadius: 1, opacity: 0.6 },
  gift: {
    width: GIFT,
    height: GIFT,
    borderRadius: GIFT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketText: { flex: 1, gap: spacing.xs, padding: spacing.md },
  kicker: { letterSpacing: 1, fontWeight: '700' },
  notch: {
    position: 'absolute',
    left: STUB - NOTCH / 2 + 1,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
  },
  notchTop: { top: -NOTCH / 2 },
  notchBottom: { bottom: -NOTCH / 2 },
});
