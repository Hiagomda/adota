import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image as NativeImage, Linking, StyleSheet, View } from 'react-native';
import { messageFrom } from '../api';
import {
  AppText,
  Button,
  Icon,
  IconButton,
  Touchable,
  useToast,
  type IconName,
} from '../components/ui';
import { logBestEffort } from '../crash/bestEffort';
import { distanceLabel, formatWhen } from '../format';
import { feedPointPinSources } from '../map/paw';
import { routeUrl } from '../partners/partners';
import { useViewerLocation } from '../place/deviceLocation';
import { useSession } from '../session';
import { motion, radius, spacing, useTheme } from '../theme';
import { reportFeedPoint } from './api';
import {
  feedPointFreshness,
  feedPointRelationShort,
  reportThanks,
  type FeedPoint,
  type FeedPointKind,
  type FeedPointReport,
} from './feedPoints';

/** A plaquinha do mapa, para o cartão e o formulário. */
export function FeedPointPin({ kind, size = 44 }: { kind: FeedPointKind; size?: number }) {
  return (
    <NativeImage
      source={feedPointPinSources[kind]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      aria-hidden
    />
  );
}

/**
 * O miolo do cartão de um ponto solidário: o que tem ali, a foto, como estava da última vez que
 * alguém passou e os botões para contar (abasteci, está vazio) e pedir a rota. Usado no mapa e
 * na tela do ponto.
 */
export function FeedPointDetails({
  point,
  compact = false,
  preview = false,
  mine = false,
  actions = true,
  onHidden,
}: {
  point: FeedPoint;
  compact?: boolean;
  /** Prévia do formulário: botões sem ação. */
  preview?: boolean;
  /** Ponto de quem está vendo: troca os avisos por "Editar". */
  mine?: boolean;
  /** Ponto fora do mapa (esperando a equipe): sem os botões de aviso. */
  actions?: boolean;
  /** O ponto saiu do mapa depois de um "não existe mais". */
  onHidden?: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const here = useViewerLocation();
  const [sending, setSending] = useState<FeedPointReport | null>(null);
  const [now] = useState(() => Date.now());
  const distance = preview ? '' : distanceLabel(here, point.location);
  const freshness = feedPointFreshness(point, now);

  const freshnessLine: Record<
    typeof freshness.state,
    { icon: IconName; text: string; tone: string }
  > = {
    refilled: {
      icon: 'check-circle',
      text: `Abastecido ${freshness.at ? formatWhen(freshness.at) : ''}`.trim(),
      tone: colors.success,
    },
    empty: {
      icon: 'alert-circle',
      text: `Marcado como vazio ${freshness.at ? formatWhen(freshness.at) : ''}`.trim(),
      tone: colors.warning,
    },
    checked: {
      icon: 'eye',
      text: `Visto por alguém ${freshness.at ? formatWhen(freshness.at) : ''}`.trim(),
      tone: colors.textSecondary,
    },
    unknown: {
      icon: 'help-circle',
      text: 'Ninguém contou como está. Passou por lá? Avise aqui.',
      tone: colors.textSecondary,
    },
  };
  const line = freshnessLine[freshness.state];

  async function send(report: FeedPointReport) {
    if (preview || sending) return;
    if (!token) {
      toast.show('Entre na sua conta para avisar como está o ponto.', 'info');
      return;
    }
    setSending(report);
    try {
      const result = await reportFeedPoint(point.id, report, token);
      toast.show(
        result.hidden ? 'O ponto saiu do mapa. Obrigado por avisar!' : reportThanks[report],
        'success',
      );
      await client.invalidateQueries({ queryKey: ['feed-points'] });
      if (result.hidden) onHidden?.();
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setSending(null);
    }
  }

  function openRoute() {
    if (preview) return;
    void Linking.openURL(routeUrl(point.location)).catch(logBestEffort('feed-points:route'));
  }

  function openPhoto() {
    if (preview || !point.photo) return;
    void Linking.openURL(point.photo.url).catch(logBestEffort('feed-points:photo'));
  }

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        {compact && point.photo ? (
          // No mapa o cartão fica baixo: a foto vira miniatura com a plaquinha no canto.
          <Touchable
            accessibilityRole="imagebutton"
            accessibilityLabel="Abrir a foto do ponto"
            disabled={preview}
            onPress={openPhoto}
          >
            <Image
              source={{ uri: point.photo.thumbUrl }}
              style={styles.thumb}
              contentFit="cover"
              transition={motion.base}
              cachePolicy="memory-disk"
              accessibilityLabel="Foto do ponto"
            />
            <View style={styles.thumbPin}>
              <FeedPointPin kind={point.kind} size={28} />
            </View>
          </Touchable>
        ) : (
          <View style={[styles.pinWrap, { backgroundColor: colors.caramelSoft }]}>
            <FeedPointPin kind={point.kind} />
          </View>
        )}
        <View style={styles.title}>
          <View style={styles.seal}>
            <Icon name="heart" size="sm" color={colors.primary} />
            <AppText variant="caption" style={[styles.sealText, { color: colors.primary }]}>
              PONTO SOLIDÁRIO
            </AppText>
          </View>
          <AppText variant="h3" numberOfLines={1}>
            {point.kindLabel}
          </AppText>
          <View style={styles.tags}>
            <Tag icon="users" text={feedPointRelationShort[point.relation]} />
            {distance ? (
              <Tag icon="navigation-2" text={distance.replace(/^a cerca de /, '')} />
            ) : null}
          </View>
        </View>
      </View>

      {!compact && point.photo ? (
        <Touchable
          accessibilityRole="imagebutton"
          accessibilityLabel="Abrir a foto do ponto"
          disabled={preview}
          onPress={openPhoto}
        >
          <Image
            source={{ uri: point.photo.url }}
            style={styles.photo}
            contentFit="cover"
            transition={motion.base}
            cachePolicy="memory-disk"
            accessibilityLabel="Foto do ponto"
          />
        </Touchable>
      ) : null}

      <View style={[styles.status, { backgroundColor: colors.surfaceMuted }]}>
        <Icon name={line.icon} size="sm" color={line.tone} />
        <AppText variant="bodySmall" style={styles.grow}>
          {line.text}
        </AppText>
      </View>

      <View style={[styles.facts, { borderColor: colors.border }]}>
        <Fact icon="map-pin" text={point.addressText} />
        {point.note ? (
          <Fact icon="message-square" text={point.note} lines={compact ? 2 : undefined} />
        ) : null}
      </View>

      {!actions ? null : mine ? (
        <View style={styles.actions}>
          <Button
            title="Abasteci agora"
            icon="check"
            loading={sending === 'refilled'}
            onPress={() => void send('refilled')}
            style={styles.grow}
          />
          <Button
            title="Editar"
            icon="edit-2"
            variant="outline"
            onPress={() => !preview && router.push(`/pontos/novo?id=${point.id}`)}
          />
        </View>
      ) : (
        <>
          <View style={styles.actions}>
            <Button
              title="Abasteci"
              loading={sending === 'refilled'}
              onPress={() => void send('refilled')}
              style={styles.grow}
            />
            <Button
              title="Está vazio"
              variant="outline"
              loading={sending === 'empty'}
              onPress={() => void send('empty')}
              style={styles.grow}
            />
            <IconButton
              icon="navigation"
              variant="tonal"
              accessibilityLabel="Rota até o ponto"
              onPress={openRoute}
            />
          </View>
          <View style={styles.minor}>
            <Touchable
              accessibilityRole="button"
              disabled={preview || sending !== null}
              onPress={() => void send('checked')}
              style={styles.link}
            >
              <AppText variant="caption" color="textSecondary">
                Passei e está lá
              </AppText>
            </Touchable>
            <AppText variant="caption" color="textSecondary">
              ·
            </AppText>
            <Touchable
              accessibilityRole="button"
              disabled={preview || sending !== null}
              onPress={() => void send('gone')}
              style={styles.link}
            >
              <AppText variant="caption" color="textSecondary">
                Não existe mais
              </AppText>
            </Touchable>
          </View>
        </>
      )}
    </View>
  );
}

function Tag({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.surfaceMuted }]}>
      <Icon name={icon} size="sm" color={colors.textSecondary} />
      <AppText variant="caption" color="textSecondary">
        {text}
      </AppText>
    </View>
  );
}

function Fact({ icon, text, lines }: { icon: IconName; text: string; lines?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size="sm" color={colors.textSecondary} />
      <AppText variant="bodySmall" color="textSecondary" style={styles.grow} numberOfLines={lines}>
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
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg },
  thumb: { width: 64, height: 80, borderRadius: radius.md },
  thumbPin: { position: 'absolute', right: -10, bottom: -8 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  facts: { gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  fact: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  minor: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  link: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
  grow: { flex: 1 },
});
