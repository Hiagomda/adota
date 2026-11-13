import { Image } from 'expo-image';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { AppText, Divider, Icon, Switch, Touchable, type IconName } from '../components/ui';
import { radius, size, spacing, useTheme } from '../theme';
import { eventPinSources, feedPointPinSources, partnerPinSources } from './paw';

export interface MapLayerState {
  events: boolean;
  feedPoints: boolean;
  partners: boolean;
}

const layers: { key: keyof MapLayerState; label: string; pin: ImageSourcePropType }[] = [
  { key: 'events', label: 'Eventos', pin: eventPinSources.vaccination },
  { key: 'feedPoints', label: 'Ração e água', pin: feedPointPinSources.both },
  { key: 'partners', label: 'Parceiros', pin: partnerPinSources.generic },
];

/**
 * Antes eram cinco chips soltos numa fileira que rolava de lado por cima do mapa. Agora é um botão
 * "Camadas" só, no canto, e as opções abrem num painel pequeno quando a pessoa quer.
 */
export function MapLayersButton({
  open,
  hidden,
  onPress,
}: {
  open: boolean;
  /** Quantas camadas estão desligadas: aparece como um pontinho para lembrar que falta algo. */
  hidden: number;
  onPress: () => void;
}) {
  const { colors, shadows } = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="Camadas do mapa"
      accessibilityState={{ expanded: open }}
      haptic="light"
      onPress={onPress}
      style={[
        styles.button,
        shadows.md,
        { backgroundColor: open ? colors.primary : colors.surface },
      ]}
    >
      <Icon name={open ? 'x' : 'layers'} color={open ? colors.onPrimary : colors.primary} />
      <AppText variant="caption" style={{ color: open ? colors.onPrimary : colors.text }}>
        Camadas
      </AppText>
      {hidden > 0 && !open ? (
        <View style={[styles.dot, { backgroundColor: colors.secondary }]} />
      ) : null}
    </Touchable>
  );
}

export function MapLayersPanel({
  value,
  onChange,
  onAddFeedPoint,
  onAdvertise,
}: {
  value: MapLayerState;
  onChange: (next: MapLayerState) => void;
  onAddFeedPoint: () => void;
  /** Só existe quando a equipe ligou o "Anuncie aqui" no painel. */
  onAdvertise?: () => void;
}) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.panel, shadows.md, { backgroundColor: colors.surface }]}>
      <AppText variant="caption" color="textSecondary" style={styles.title}>
        MOSTRAR NO MAPA
      </AppText>
      {layers.map((layer) => (
        <View key={layer.key} style={styles.layerRow}>
          <Image source={layer.pin} style={styles.pin} contentFit="contain" />
          <View style={styles.switch}>
            <Switch
              label={layer.label}
              value={value[layer.key]}
              onValueChange={(next) => onChange({ ...value, [layer.key]: next })}
            />
          </View>
        </View>
      ))}
      <Divider />
      <PanelAction icon="plus" label="Cadastrar ponto de ração e água" onPress={onAddFeedPoint} />
      {onAdvertise ? (
        <PanelAction icon="volume-2" label="Anuncie aqui" onPress={onAdvertise} />
      ) : null}
    </View>
  );
}

function PanelAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Touchable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Icon name={icon} color={colors.primary} />
      <AppText style={{ color: colors.primary }}>{label}</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: size.touch,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panel: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    width: 280,
  },
  title: { marginBottom: spacing.xs, letterSpacing: 0.6 },
  layerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pin: { width: 28, height: 28 },
  switch: { flex: 1 },
  action: {
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
