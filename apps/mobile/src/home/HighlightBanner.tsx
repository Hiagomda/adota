import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useScreenReader } from '../a11y/useScreenReader';
import { deadlineLabel, formatCents, goalProgress, isBannerColor } from '../campaign/campaign';
import { AppText, HeroSurface, Icon, Photo, Touchable, type IconName } from '../components/ui';
import { categoryIcons, categoryLabels, spotsLabel } from '../events/agenda';
import { fairWhen } from '../events/fairs';
import { belemToday } from '../passport/passport';
import {
  darkAccentHeroes,
  lightAccentHeroes,
  motion,
  radius,
  spacing,
  useMotionDuration,
  useTheme,
  type AccentHero,
} from '../theme';
import type { Highlight } from './highlights';

/** Tempo que cada destaque fica antes de o próximo entrar. */
const ADVANCE_MS = 6000;
const BANNER_HEIGHT = 196;
const SIDE_ART = 92;

const brlShort = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** "R$ 1.500" em vez de "R$ 1.500,00", que não cabe na faixa. */
function shortMoney(cents: number): string {
  return brlShort.format(Math.round(cents / 100)).replace(/ /g, ' ');
}

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Dia e mês no calendário de Belém, para o bloquinho de data do evento. */
function dayAndMonth(instant: string): { day: string; month: string } {
  const local = new Date(Date.parse(instant) - 3 * 3_600_000);
  return { day: String(local.getUTCDate()), month: months[local.getUTCMonth()] ?? '' };
}

function Slide({
  item,
  hero: baseHero,
  width,
  position,
  count,
  onOpen,
}: {
  item: Highlight;
  hero: AccentHero;
  width: number;
  position: number;
  count: number;
  onOpen: (item: Highlight) => void;
}) {
  let hero = baseHero;
  const { colors } = useTheme();
  const label = `Destaque ${position + 1} de ${count}`;
  if (item.kind === 'campaign') {
    const { campaign } = item;
    // Foto escolhida por quem abriu a campanha: texto branco sobre um véu escuro.
    const photo = campaign.bannerUrl ?? null;
    if (photo) {
      hero = {
        ...hero,
        text: colors.onMedia,
        muted: colors.onMedia,
        glass: colors.onMediaMuted,
      };
    }
    const progress = goalProgress(campaign.raisedCents, campaign.goalCents);
    const left = deadlineLabel(campaign.deadline, belemToday());
    return (
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`Campanha: ${campaign.title}. ${formatCents(campaign.raisedCents)} confirmados de ${formatCents(campaign.goalCents)}, ${left}. ${label}`}
        pressedScale={0.98}
        onPress={() => onOpen(item)}
        style={{ width, height: BANNER_HEIGHT }}
      >
        <HeroSurface
          curved={false}
          start={hero.start}
          end={hero.end}
          patternColor={hero.glass}
          style={styles.surface}
        >
          {photo ? (
            <>
              <Photo
                uri={photo}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityLabel=""
              />
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.mediaScrim }]}
                pointerEvents="none"
              />
            </>
          ) : null}
          <View style={styles.row}>
            <View style={styles.copy}>
              <View style={[styles.tag, { backgroundColor: hero.glass }]}>
                <Icon name="heart" size="sm" color={hero.text} />
                <AppText variant="caption" style={{ color: hero.text }}>
                  CAMPANHA
                </AppText>
              </View>
              <AppText variant="h3" numberOfLines={2} style={{ color: hero.text }}>
                {campaign.title}
              </AppText>
              <View style={[styles.track, { backgroundColor: hero.glass }]}>
                <View
                  style={[
                    styles.fill,
                    { width: `${Math.round(progress * 100)}%`, backgroundColor: hero.text },
                  ]}
                />
              </View>
              <AppText variant="bodySmallStrong" numberOfLines={1} style={{ color: hero.text }}>
                {`${shortMoney(campaign.raisedCents)} de ${shortMoney(campaign.goalCents)}`}
              </AppText>
            </View>
            {campaign.coverUrl && !photo ? (
              <Photo
                uri={campaign.coverUrl}
                style={[styles.art, { borderColor: hero.glass }]}
                contentFit="cover"
                accessibilityLabel=""
              />
            ) : null}
          </View>
          <View style={styles.foot}>
            <View style={styles.cta}>
              <AppText variant="bodySmallStrong" style={{ color: hero.text }}>
                Quero ajudar
              </AppText>
              <Icon name="arrow-right" size="sm" color={hero.text} />
            </View>
            <AppText variant="caption" numberOfLines={1} style={{ color: hero.muted }}>
              {left}
            </AppText>
          </View>
        </HeroSurface>
      </Touchable>
    );
  }

  const { event } = item;
  const when = fairWhen(event.startsAt, event.endsAt);
  const date = dayAndMonth(event.startsAt);
  const kind = categoryLabels[event.category];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${kind}: ${event.title}. ${when}. ${event.placeLabel}. ${label}`}
      pressedScale={0.98}
      onPress={() => onOpen(item)}
      style={{ width, height: BANNER_HEIGHT }}
    >
      <HeroSurface
        curved={false}
        start={hero.start}
        end={hero.end}
        patternColor={hero.glass}
        style={styles.surface}
      >
        <View style={styles.row}>
          <View style={styles.copy}>
            <View style={[styles.tag, { backgroundColor: hero.glass }]}>
              <Icon name={categoryIcons[event.category] as IconName} size="sm" color={hero.text} />
              <AppText variant="caption" numberOfLines={1} style={{ color: hero.text }}>
                {kind.toUpperCase()}
              </AppText>
            </View>
            <AppText variant="h3" numberOfLines={2} style={{ color: hero.text }}>
              {event.title}
            </AppText>
            <AppText variant="bodySmallStrong" numberOfLines={1} style={{ color: hero.text }}>
              {when}
            </AppText>
            <AppText variant="bodySmall" numberOfLines={1} style={{ color: hero.muted }}>
              {`${event.neighborhood ?? event.placeLabel} · ${spotsLabel(event)}`}
            </AppText>
          </View>
          <View style={[styles.art, styles.date, { backgroundColor: hero.glass }]}>
            <AppText variant="display" style={{ color: hero.text }}>
              {date.day}
            </AppText>
            <AppText variant="caption" style={{ color: hero.text }}>
              {date.month.toUpperCase()}
            </AppText>
          </View>
        </View>
        <View style={styles.cta}>
          <AppText variant="bodySmallStrong" style={{ color: hero.text }}>
            {event.permissions.canRegister ? 'Quero participar' : 'Ver evento'}
          </AppText>
          <Icon name="arrow-right" size="sm" color={hero.text} />
        </View>
      </HeroSurface>
    </Touchable>
  );
}

/**
 * Faixa em destaque no topo do Início: campanhas de arrecadação em coral e eventos/mutirões em
 * turquesa, passando sozinhos até a pessoa mexer. Parada com leitor de tela ou movimento reduzido.
 */
export function HighlightBanner({
  items,
  onOpen,
}: {
  items: Highlight[];
  onOpen: (item: Highlight) => void;
}) {
  const { colors, dark } = useTheme();
  const heroes = dark ? darkAccentHeroes : lightAccentHeroes;
  const duration = useMotionDuration();
  const screenReader = useScreenReader();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);
  const still = duration(motion.base) === 0;
  const count = items.length;
  const current = index < count ? index : 0;

  useEffect(() => {
    if (touched || screenReader || still || count < 2 || width === 0) return undefined;
    const timer = setTimeout(() => {
      const next = (current + 1) % count;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [count, current, screenReader, still, touched, width]);

  if (count === 0) return null;

  function onSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    // Conta durante a rolagem (e não só no fim): no web o fim do arrasto não avisa.
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(next, 0), count - 1));
  }

  return (
    <View style={styles.block}>
      <View
        style={styles.frame}
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          setWidth((before) => (before === next ? before : next));
        }}
      >
        {width > 0 ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => setTouched(true)}
            onScroll={onSettle}
            scrollEventThrottle={64}
          >
            {items.map((item, position) => (
              <Slide
                key={item.id}
                item={item}
                hero={
                  item.kind === 'campaign'
                    ? heroes[
                        isBannerColor(item.campaign.bannerColor)
                          ? item.campaign.bannerColor
                          : 'coral'
                      ]
                    : heroes.turquoise
                }
                width={width}
                position={position}
                count={count}
                onOpen={onOpen}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {count > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {items.map((item, position) => (
            <Animated.View
              key={item.id}
              style={[
                styles.dot,
                {
                  width: position === current ? spacing.xl : spacing.sm,
                  backgroundColor: position === current ? colors.primary : colors.border,
                  transitionProperty: ['width', 'backgroundColor'],
                  transitionDuration: duration(motion.base),
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  frame: { height: BANNER_HEIGHT, borderRadius: radius.xl, overflow: 'hidden' },
  surface: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  track: { alignSelf: 'stretch', height: spacing.sm, borderRadius: radius.pill, marginTop: 2 },
  fill: { height: '100%', borderRadius: radius.pill },
  art: { width: SIDE_ART, height: SIDE_ART, borderRadius: radius.lg, borderWidth: 2 },
  date: { borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  dot: { height: spacing.xs + 2, borderRadius: radius.pill },
});
