import { Linking, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Icon } from '../components/ui';
import { reportError } from '../crash/reporter';
import { radius, spacing, useTheme } from '../theme';
import { directionsUrl, fairWhen, happeningNow, type AdoptionFair } from './fairs';

/** Uma feira de adoção: quando, onde, quem organiza e o caminho até lá no app de mapas. */
export function FairCard({
  fair,
  onOrganizer,
  onRemove,
  onError,
}: {
  fair: AdoptionFair;
  onOrganizer: (handle: string) => void;
  onRemove?: (fair: AdoptionFair) => void;
  onError: (message: string) => void;
}) {
  const { colors } = useTheme();
  const live = happeningNow(fair);

  function openDirections() {
    Linking.openURL(directionsUrl(fair.location)).catch((error: unknown) => {
      reportError(error, { source: 'handled', where: 'fair:directions' });
      onError('Não consegui abrir o mapa. Confira se tem um app de mapas instalado.');
    });
  }

  return (
    <Card elevation="md" padding="md" style={styles.card}>
      <View style={styles.top}>
        <View
          style={[
            styles.badge,
            { backgroundColor: live ? colors.secondarySoft : colors.caramelSoft },
          ]}
        >
          <Icon name="calendar" color={live ? colors.onSecondarySoft : colors.onCaramelSoft} />
        </View>
        <View style={styles.text}>
          <AppText variant="h3">{fair.title}</AppText>
          <AppText variant="bodySmallStrong" color="primary">
            {fairWhen(fair.startsAt, fair.endsAt)}
          </AppText>
          <AppText variant="bodySmall" color="textSecondary">
            {fair.placeLabel}
          </AppText>
        </View>
      </View>
      {fair.description ? <AppText variant="bodySmall">{fair.description}</AppText> : null}
      <AppText
        variant="caption"
        color="textSecondary"
        accessibilityRole="link"
        onPress={() => onOrganizer(fair.organizer.handle)}
      >
        Organizado por {fair.organizer.name}
        {fair.organizer.verified ? ' · perfil verificado' : ''}
      </AppText>
      <View style={styles.actions}>
        <Button
          title="Como chegar"
          icon="navigation"
          variant="outline"
          onPress={openDirections}
          style={styles.grow}
        />
        {fair.canRemove && onRemove ? (
          <Button title="Cancelar feira" variant="ghost" onPress={() => onRemove(fair)} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', gap: spacing.sm },
  top: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
});
