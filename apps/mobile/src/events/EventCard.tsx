import { StyleSheet, View } from 'react-native';
import { AppText, Card, Icon, InfoChip, type IconName } from '../components/ui';
import { radius, spacing, useTheme } from '../theme';
import {
  categoryIcons,
  categoryLabels,
  registrationLabel,
  spotsLabel,
  stateLabel,
  type CommunityEvent,
} from './agenda';
import { fairWhen } from './fairs';

/** Um evento da agenda: tipo, quando, onde, vagas e a inscrição de quem vê. */
export function EventCard({
  event,
  onOpen,
}: {
  event: CommunityEvent;
  onOpen: (event: CommunityEvent) => void;
}) {
  const { colors } = useTheme();
  const state = stateLabel(event);
  const mine = registrationLabel(event.registration);
  const closed = event.state === 'cancelled' || event.state === 'finished';
  const when = fairWhen(event.startsAt, event.endsAt);
  const distance =
    event.distanceKm !== null ? ` · ${event.distanceKm.toLocaleString('pt-BR')} km` : '';
  return (
    <Card
      elevation="md"
      padding="md"
      style={[styles.card, closed ? styles.closed : null]}
      onPress={() => onOpen(event)}
      accessibilityLabel={`${categoryLabels[event.category]}: ${event.title}. ${when}. ${event.placeLabel}.${state ? ` ${state}.` : ''}${mine ? ` ${mine}.` : ''}`}
    >
      <View style={styles.top}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                event.state === 'happening' ? colors.secondarySoft : colors.caramelSoft,
            },
          ]}
        >
          <Icon
            name={categoryIcons[event.category] as IconName}
            color={event.state === 'happening' ? colors.onSecondarySoft : colors.onCaramelSoft}
          />
        </View>
        <View style={styles.text}>
          <AppText variant="caption" color="textSecondary">
            {categoryLabels[event.category].toUpperCase()}
          </AppText>
          <AppText variant="h3" numberOfLines={2}>
            {event.title}
          </AppText>
          <AppText variant="bodySmallStrong" color="primary">
            {when}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {event.placeLabel}
            {distance}
          </AppText>
        </View>
      </View>
      <View style={styles.chips}>
        {state ? (
          <InfoChip
            label={state}
            tone={
              event.state === 'cancelled' || event.reviewStatus === 'rejected' ? 'error' : 'warning'
            }
          />
        ) : null}
        {mine ? <InfoChip label={mine} icon="check" tone="success" /> : null}
        {!closed ? <InfoChip label={spotsLabel(event)} icon="users" tone="neutral" /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', gap: spacing.sm },
  closed: { opacity: 0.75 },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
