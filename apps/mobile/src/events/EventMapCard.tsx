import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { AppText, Button } from '../components/ui';
import { distanceLabel } from '../format';
import { eventPinSources } from '../map/paw';
import { useViewerLocation } from '../place/deviceLocation';
import { spacing } from '../theme';
import { categoryLabels, spotsLabel, type CommunityEvent } from './agenda';
import { fairWhen } from './fairs';

const PIN_SIZE = 56;

/** O miolo do cartão de um evento tocado no mapa: tipo, nome, quando, onde e o botão de abrir. */
export function EventMapCard({
  event,
  onOpen,
}: {
  event: CommunityEvent;
  onOpen: (event: CommunityEvent) => void;
}) {
  const here = useViewerLocation();
  const distance = distanceLabel(here, event.location);
  const happening = event.state === 'happening';
  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <Image
          source={eventPinSources[event.category]}
          style={styles.pin}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.text}>
          <AppText variant="caption" color="textSecondary">
            {(happening
              ? `${categoryLabels[event.category]} · acontecendo agora`
              : categoryLabels[event.category]
            ).toUpperCase()}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {event.title}
          </AppText>
          <AppText variant="bodySmallStrong" color="primary">
            {fairWhen(event.startsAt, event.endsAt)}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {[event.placeLabel, distance].filter(Boolean).join(' · ')}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {spotsLabel(event)}
          </AppText>
        </View>
      </View>
      <Button
        title="Ver evento"
        icon="arrow-right"
        iconPosition="right"
        fullWidth
        onPress={() => onOpen(event)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  pin: { width: PIN_SIZE, height: PIN_SIZE },
  text: { flex: 1, gap: spacing.xs },
});
