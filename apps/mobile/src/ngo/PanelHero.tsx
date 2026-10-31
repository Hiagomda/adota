import { Linking, StyleSheet, View } from 'react-native';
import { AppText, Avatar, HeroSurface, Icon, Touchable } from '../components/ui';
import type { IconName } from '../components/ui/Icon';
import { darkAccentHeroes, lightAccentHeroes, radius, size, spacing, useTheme } from '../theme';
import type { NgoPanel } from './panel';

/**
 * Capa do painel: degradê na cor da ONG com a textura de ossinho e peixinho, o avatar grande com
 * o selo, o nome e a frase. A capa termina em onda, e os números ficam por cima dela.
 */
export function PanelHero({
  topInset,
  panel,
  greeting,
  onBack,
  onTheme,
  onProfile,
}: {
  /** A capa vai até o topo da tela, por baixo da barra de status. */
  topInset: number;
  panel: NgoPanel;
  greeting: string;
  onBack: () => void;
  onTheme: () => void;
  onProfile: () => void;
}) {
  const { dark, colors } = useTheme();
  const hero =
    (dark ? darkAccentHeroes : lightAccentHeroes)[panel.theme.accent] ??
    lightAccentHeroes.turquoise;
  const { org } = panel;
  const instagram = org.instagram;

  return (
    <HeroSurface
      start={hero.start}
      end={hero.end}
      patternColor={hero.text}
      style={[styles.hero, { paddingTop: topInset }]}
    >
      <View style={styles.bar}>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={onBack}
          style={styles.back}
        >
          <Icon name="arrow-left" size="lg" color={hero.text} />
        </Touchable>
        <AppText variant="bodySmallStrong" style={[styles.barTitle, { color: hero.muted }]}>
          {greeting}
        </AppText>
        <Touchable
          accessibilityRole="button"
          accessibilityLabel="Mudar a cor e a frase do painel"
          onPress={onTheme}
          style={[styles.themeButton, { backgroundColor: hero.glass }]}
        >
          <Icon name="droplet" size="sm" color={hero.text} />
          <AppText variant="caption" style={{ color: hero.text }}>
            Tema
          </AppText>
        </Touchable>
      </View>

      <View style={styles.identity}>
        <View style={[styles.ring, { backgroundColor: colors.surface }]}>
          <Avatar name={org.name} uri={org.avatarUrl} size="xl" verified />
        </View>
        <AppText variant="h1" style={[styles.center, { color: hero.text }]} numberOfLines={2}>
          {org.name}
        </AppText>
        <AppText variant="bodySmall" style={[styles.center, { color: hero.muted }]}>
          @{org.handle}
          {org.neighborhood ? ` · ${org.neighborhood}` : ''}
        </AppText>
        {panel.theme.tagline ? (
          <AppText style={[styles.center, styles.tagline, { color: hero.text }]}>
            “{panel.theme.tagline}”
          </AppText>
        ) : null}
        <View style={styles.pills}>
          <Pill
            icon="shield"
            label={org.role === 'ngo' ? 'ONG verificada' : 'Protetor verificado'}
            background={hero.glass}
            color={hero.text}
          />
          <Pill
            icon="user"
            label="Ver perfil"
            background={hero.glass}
            color={hero.text}
            onPress={onProfile}
          />
          {instagram ? (
            <Pill
              icon="instagram"
              label={`@${instagram}`}
              background={hero.glass}
              color={hero.text}
              onPress={() => void Linking.openURL(`https://www.instagram.com/${instagram}`)}
            />
          ) : null}
        </View>
      </View>
    </HeroSurface>
  );
}

function Pill({
  icon,
  label,
  background,
  color,
  onPress,
}: {
  icon: IconName;
  label: string;
  background: string;
  color: string;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Icon name={icon} size="sm" color={color} />
      <AppText variant="caption" style={{ color }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
  if (!onPress) return content;
  return (
    <Touchable accessibilityRole="link" accessibilityLabel={label} onPress={onPress}>
      {content}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  // Espaço extra embaixo: a onda e o cartão de números que sobe sobre ela.
  hero: { paddingBottom: size.curve + spacing.xxxl + spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  back: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1 },
  themeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    marginRight: spacing.sm,
  },
  identity: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  ring: { borderRadius: radius.pill, padding: spacing.xs, marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  tagline: { fontStyle: 'italic', marginTop: spacing.xs },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    maxWidth: 220,
  },
});
