import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { api } from '../api';
import { AppText, BottomSheet, Icon, ListItem, Touchable } from '../components/ui';
import { radius, size, spacing, useTheme } from '../theme';
import { municipalities, municipalityByCode, type Municipality } from './serviceArea';

interface MunicipalityList {
  municipalities: { code: string; animals: number }[];
}

/**
 * Quantos animais estão no mapa em cada cidade (GET /municipalities). API antiga ou sem rede:
 * a lista local continua funcionando, só sem os números.
 */
export function useCityCounts(): Map<string, number> | null {
  const query = useQuery({
    queryKey: ['municipalities'],
    queryFn: () => api<MunicipalityList>('/municipalities'),
    staleTime: 2 * 60 * 1000,
  });
  if (!query.data) return null;
  return new Map(query.data.municipalities.map((item) => [item.code, item.animals]));
}

function animalsLabel(count: number | undefined): string | undefined {
  if (count === undefined) return undefined;
  if (count === 0) return 'Nenhum animal no mapa agora';
  return count === 1 ? '1 animal no mapa' : `${count} animais no mapa`;
}

/** Botão compacto com a cidade (ícone de alfinete + nome + seta), para o topo do mapa. */
export function CityButton({
  label,
  onPress,
  hint = 'Escolher cidade',
}: {
  label: string;
  onPress: () => void;
  hint?: string;
}) {
  const { colors, shadows } = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`${hint}. Agora: ${label}`}
      onPress={onPress}
      style={[styles.button, shadows.md, { backgroundColor: colors.surface }]}
    >
      <Icon name="map-pin" size="sm" color={colors.primary} />
      <AppText variant="bodyStrong" numberOfLines={1} style={styles.buttonText}>
        {label}
      </AppText>
      <Icon name="chevron-down" size="sm" color={colors.textSecondary} />
    </Touchable>
  );
}

/** Lista das cidades atendidas, com a escolhida marcada. */
export function CitySheet({
  visible,
  current,
  title = 'Escolha a cidade',
  onClose,
  onChoose,
  options = municipalities,
  allLabel,
  onChooseAll,
}: {
  visible: boolean;
  current: string | null;
  title?: string;
  onClose: () => void;
  onChoose: (city: Municipality) => void;
  /** Só estas cidades (ex.: as perto de uma divisa). Padrão: todas. */
  options?: readonly Municipality[];
  /** Primeira linha que tira o filtro ("Todas as cidades"), para listas e buscas. */
  allLabel?: string;
  onChooseAll?: () => void;
}) {
  const { colors } = useTheme();
  const counts = useCityCounts();
  const check = <Icon name="check" color={colors.primary} />;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {allLabel && onChooseAll ? (
          <ListItem
            title={allLabel}
            icon="globe"
            trailing={current === null ? check : undefined}
            onPress={onChooseAll}
          />
        ) : null}
        {options.map((city) => (
          <ListItem
            key={city.code}
            title={city.name}
            subtitle={animalsLabel(counts?.get(city.code))}
            icon="map-pin"
            trailing={city.code === current ? check : undefined}
            onPress={() => onChoose(city)}
            accessibilityLabel={
              city.code === current ? `${city.name}, escolhida` : `Ir para ${city.name}`
            }
          />
        ))}
        <View style={styles.footer}>
          <AppText variant="caption" color="textSecondary">
            Atendemos estas cidades do Pará. Outras entram aos poucos.
          </AppText>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export function cityName(code: string | null | undefined, fallback = 'Fora da área'): string {
  return municipalityByCode(code)?.name ?? fallback;
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: size.touch,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    maxWidth: 260,
  },
  buttonText: { flexShrink: 1 },
  list: { maxHeight: 460 },
  listContent: { gap: spacing.xs, paddingBottom: spacing.md },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
