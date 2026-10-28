import { StyleSheet, View } from 'react-native';
import { AppText, Card, Icon, Photo, ProgressBar, Touchable } from '../components/ui';
import { belemToday } from '../passport/passport';
import { radius, spacing, useTheme } from '../theme';
import {
  deadlineLabel,
  formatCents,
  goalProgress,
  phaseLabels,
  type CampaignSummary,
} from './campaign';

/** Uma campanha na lista: foto do caso, quem é o responsável e quanto já foi confirmado. */
export function CampaignTile({
  campaign,
  onPress,
}: {
  campaign: CampaignSummary;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const progress = goalProgress(campaign.raisedCents, campaign.goalCents);
  const when =
    campaign.phase === 'active'
      ? deadlineLabel(campaign.deadline, belemToday())
      : phaseLabels[campaign.phase];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${campaign.title}. ${formatCents(campaign.raisedCents)} confirmados de ${formatCents(campaign.goalCents)}. ${when}.`}
      onPress={onPress}
      pressedScale={0.98}
    >
      <Card elevation="md" padding="none">
        <View style={styles.row}>
          <Photo
            uri={campaign.coverUrl}
            style={[styles.cover, { backgroundColor: colors.surfaceMuted }]}
            accessibilityLabel=""
          />
          <View style={styles.text}>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {campaign.title}
            </AppText>
            <View style={styles.owner}>
              <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
                {campaign.owner.name}
              </AppText>
              {campaign.owner.verified ? (
                <Icon name="check-circle" size="sm" color={colors.primary} />
              ) : null}
            </View>
            <ProgressBar
              value={progress}
              caption={`${formatCents(campaign.raisedCents)} de ${formatCents(campaign.goalCents)}`}
              tone="secondary"
            />
            <AppText variant="caption" color="textSecondary">
              {when}
            </AppText>
          </View>
        </View>
      </Card>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, alignItems: 'center' },
  cover: { width: 88, height: 104, borderRadius: radius.lg },
  text: { flex: 1, gap: spacing.xs },
  owner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
