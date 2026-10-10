import { StyleSheet, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import {
  motion,
  radius,
  size,
  spacing,
  STAGGER_MS,
  useMotionDuration,
  useTheme,
} from '../../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { ProgressBar } from './ProgressBar';
import { toneColors, type Tone } from './tones';
import { Touchable } from './Touchable';

const kinds: Record<string, { label: string; icon: IconName; tone: Tone }> = {
  food: { label: 'Ração e comida', icon: 'package', tone: 'caramel' },
  vet: { label: 'Cuidados de saúde', icon: 'activity', tone: 'error' },
  castration: { label: 'Castração', icon: 'scissors', tone: 'info' },
  transport: { label: 'Transporte', icon: 'truck', tone: 'primary' },
};
const fallbackKind = { label: 'Pedido de ajuda', icon: 'heart' as IconName, tone: 'secondary' as Tone };

const DAY_MS = 86_400_000;
const MAX_STAGGER = 6;
const ICON_CIRCLE = 48;

export interface CampaignCardProps {
  kind: string;
  place: string;
  /** Decimal string sent by the API, e.g. "300.00". */
  goalAmount: string | null;
  deadline: string | null;
  createdAt: string;
  index?: number;
  onPress: () => void;
}

function formatGoal(goalAmount: string | null): string | null {
  if (goalAmount === null) return null;
  const value = Number(goalAmount);
  if (!Number.isFinite(value)) return null;
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

/** Share of the time between the post and the deadline that already went by, and a caption. */
function deadlineProgress(createdAt: string, deadline: string): { value: number; caption: string } {
  const end = new Date(deadline).getTime();
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  if (Number.isNaN(end) || Number.isNaN(start) || end <= start) return { value: 0, caption: '' };
  const days = Math.ceil((end - now) / DAY_MS);
  const caption = days <= 0 ? 'Encerrado' : days === 1 ? 'Falta 1 dia' : `Faltam ${days} dias`;
  return { value: (now - start) / (end - start), caption };
}

/** Help request of a verified profile. It shows the goal and the deadline; the Pix is on the post. */
export function CampaignCard({
  kind,
  place,
  goalAmount,
  deadline,
  createdAt,
  index = 0,
  onPress,
}: CampaignCardProps) {
  const { colors, shadows } = useTheme();
  const duration = useMotionDuration();
  const info = kinds[kind] ?? fallbackKind;
  const { background, foreground } = toneColors(colors, info.tone);
  const goal = formatGoal(goalAmount);
  const time = deadline ? deadlineProgress(createdAt, deadline) : null;
  return (
    <Animated.View
      entering={FadeInRight.delay(duration(Math.min(index, MAX_STAGGER) * STAGGER_MS)).duration(
        duration(motion.slow),
      )}
      style={[shadows.md, styles.shadow, { backgroundColor: colors.surfaceRaised }]}
    >
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${info.label} em ${place}${goal ? `. Meta de ${goal}` : ''}${time?.caption ? `. ${time.caption}` : ''}`}
        pressedScale={0.97}
        onPress={onPress}
        style={[styles.card, { backgroundColor: colors.surfaceRaised }]}
      >
        <View style={styles.head}>
          <View style={[styles.circle, { backgroundColor: background }]}>
            <Icon name={info.icon} size="lg" color={foreground} />
          </View>
          <View style={styles.headText}>
            <AppText variant="h3" numberOfLines={1}>
              {info.label}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {place}
            </AppText>
          </View>
        </View>
        {goal ? (
          <View>
            <AppText variant="caption" color="textSecondary">
              Meta do pedido
            </AppText>
            <AppText variant="h1" color="primary">
              {goal}
            </AppText>
          </View>
        ) : null}
        {time && time.caption ? (
          <ProgressBar value={time.value} label="Prazo" caption={time.caption} tone="secondary" />
        ) : null}
        <View style={styles.action}>
          <AppText variant="bodySmallStrong" color="primary">
            Ver como ajudar
          </AppText>
          <Icon name="arrow-right" size="sm" color={colors.primary} />
        </View>
      </Touchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shadow: { width: size.orgCard.width + spacing.xxl, borderRadius: radius.xl },
  card: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1 },
  circle: {
    width: ICON_CIRCLE,
    height: ICON_CIRCLE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
