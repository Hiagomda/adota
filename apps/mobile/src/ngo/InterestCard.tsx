import { StyleSheet, View } from 'react-native';
import { speciesLabel } from '../animalLabels';
import { AppText, Avatar, Card, Photo, PhotoScrim } from '../components/ui';
import { formatWhen } from '../format';
import { answerLines } from '../post/adoptionInterest';
import { radius, spacing, useTheme } from '../theme';
import type { PanelInterest } from './panel';

export const INTEREST_CARD_WIDTH = 264;
const PHOTO_HEIGHT = 132;
const AVATAR_LIFT = 24;

/** Uma ficha no carrossel: a foto do animal em cima, quem quer adotar e as primeiras respostas. */
export function InterestCard({
  interest,
  onPress,
}: {
  interest: PanelInterest;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const animal = interest.animal.name ?? speciesLabel[interest.animal.species] ?? 'Bichinho';
  const lines = answerLines(interest.answers, interest.animal.species).slice(0, 3);
  return (
    <Card
      elevation="md"
      padding="none"
      onPress={onPress}
      style={styles.card}
      accessibilityLabel={`${interest.person.name} quer adotar ${animal}. ${lines.join('. ')}.`}
    >
      <View style={styles.photoBox}>
        <Photo
          uri={interest.animal.photoUrl}
          style={[styles.photo, { backgroundColor: colors.surfaceMuted }]}
          accessibilityLabel=""
        />
        <PhotoScrim stop={0.5} edge="top" />
        <View style={styles.onPhoto}>
          <AppText variant="caption" style={{ color: colors.onMedia }}>
            QUER ADOTAR
          </AppText>
          <AppText variant="h3" style={{ color: colors.onMedia }} numberOfLines={1}>
            {animal}
          </AppText>
        </View>
      </View>
      <View style={styles.body}>
        <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
          <Avatar
            name={interest.person.name}
            uri={interest.person.avatarUrl}
            size="lg"
            verified={interest.person.verified}
          />
        </View>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {interest.person.name}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {formatWhen(interest.updatedAt)}
        </AppText>
        <View style={styles.answers}>
          {lines.map((line) => (
            <View key={line} style={[styles.answer, { backgroundColor: colors.surfaceMuted }]}>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {line}
              </AppText>
            </View>
          ))}
        </View>
        {interest.note ? (
          <AppText variant="bodySmall" numberOfLines={2} style={styles.note}>
            “{interest.note}”
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { width: INTEREST_CARD_WIDTH, overflow: 'hidden' },
  photoBox: { height: PHOTO_HEIGHT },
  photo: { width: '100%', height: PHOTO_HEIGHT },
  onPhoto: { position: 'absolute', left: spacing.md, right: spacing.md, top: spacing.md },
  body: { padding: spacing.md, paddingTop: 0, gap: spacing.xs },
  avatar: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    padding: 3,
    marginTop: -AVATAR_LIFT,
    marginBottom: spacing.xs,
  },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  answer: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  note: { marginTop: spacing.xs, fontStyle: 'italic' },
});
