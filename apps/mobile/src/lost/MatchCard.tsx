import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { sexLabel, sizeLabel, speciesLabel } from '../animalLabels';
import { AppText, Card, Icon, Photo, ProgressBar, Touchable } from '../components/ui';
import { formatWhen } from '../format';
import { radius, spacing, useTheme } from '../theme';
import {
  distanceText,
  furColorsText,
  sortedReasons,
  strengthLabel,
  type MatchAnimal,
  type MatchReason,
  type MatchStrength,
} from './lostMatch';

interface MatchCardProps {
  score: number;
  strength: MatchStrength;
  reasons: MatchReason[];
  distanceKm: number;
  post: {
    id: string;
    approxLabel: string;
    createdAt: string;
    description: string;
    animal: MatchAnimal;
    photo: { thumbUrl: string } | null;
  };
  /** "Visto" para encontrado, "Sumiu" para perdido. */
  when: string;
  onOpen: () => void;
  confirmed?: boolean;
  children?: ReactNode;
}

/**
 * Uma sugestão: foto, nota e cada motivo com os pontos, para a pessoa entender por que o app
 * achou parecido. Nunca diz que é o mesmo animal.
 */
export function MatchCard({
  score,
  strength,
  reasons,
  distanceKm,
  post,
  when,
  onOpen,
  confirmed = false,
  children,
}: MatchCardProps) {
  const { colors } = useTheme();
  const animal = post.animal;
  const title = animal.name?.trim() || speciesLabel[animal.species] || 'Animal';
  const facts = [
    sizeLabel[animal.size] ? `porte ${sizeLabel[animal.size]?.toLowerCase()}` : null,
    animal.sex ? (sexLabel[animal.sex]?.toLowerCase() ?? null) : null,
    furColorsText(animal.colors) || null,
  ].filter((item): item is string => Boolean(item));
  return (
    <Card elevation="md" padding="none">
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`Abrir o post de ${title}`}
        pressedScale={0.99}
        onPress={onOpen}
        style={styles.top}
      >
        <Photo
          uri={post.photo?.thumbUrl}
          style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
          accessibilityLabel={`Foto de ${title}`}
          iconSize="lg"
        />
        <View style={styles.text}>
          <AppText variant="h3" numberOfLines={1}>
            {title}
          </AppText>
          {facts.length > 0 ? (
            <AppText color="textSecondary" numberOfLines={2}>
              {facts.join(' · ')}
            </AppText>
          ) : null}
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {when} {formatWhen(post.createdAt)} · {post.approxLabel} · {distanceText(distanceKm)}
          </AppText>
        </View>
        <Icon name="chevron-right" color={colors.textSecondary} />
      </Touchable>
      <View style={styles.body}>
        <ProgressBar
          value={score / 100}
          label={confirmed ? 'Você disse que é ele' : strengthLabel[strength]}
          caption={`${score} de 100`}
          tone={strength === 'high' ? 'primary' : strength === 'medium' ? 'caramel' : 'secondary'}
        />
        <View accessibilityRole="list" style={styles.reasons}>
          {sortedReasons(reasons).map((reason) => (
            <View key={reason.code} style={styles.reason}>
              <Icon
                name={reason.points > 0 ? 'check' : reason.points < 0 ? 'x' : 'minus'}
                size="sm"
                color={
                  reason.points > 0
                    ? colors.success
                    : reason.points < 0
                      ? colors.errorText
                      : colors.textSecondary
                }
              />
              <AppText variant="bodySmall" style={styles.reasonText}>
                {reason.label}
              </AppText>
              <AppText variant="bodySmall" color="textSecondary">
                {reason.points > 0 ? `+${reason.points}` : reason.points}
              </AppText>
            </View>
          ))}
        </View>
        {post.description ? (
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={3}>
            “{post.description}”
          </AppText>
        ) : null}
        {children}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'center' },
  photo: { width: 84, height: 84, borderRadius: radius.lg },
  text: { flex: 1, gap: 2 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  reasons: { gap: spacing.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reasonText: { flex: 1 },
});
