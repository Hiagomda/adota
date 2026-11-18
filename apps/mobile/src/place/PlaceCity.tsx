import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Icon, Notice } from '../components/ui';
import { CitySheet } from '../map/CityPicker';
import type { MapPoint } from '../map/geo';
import {
  municipalitiesNear,
  municipalityAt,
  municipalityByCode,
  type Municipality,
} from '../map/serviceArea';
import { spacing, useTheme } from '../theme';

export interface PlaceCityState {
  /** A cidade que vai junto com o cadastro. Null sem ponto ou fora da área. */
  city: Municipality | null;
  /** As cidades possíveis para o ponto (mais de uma perto de divisa). */
  candidates: Municipality[];
  choose: (code: string | null) => void;
}

/**
 * A cidade do ponto marcado. Sai do mapa (contorno do IBGE), nunca de texto digitado. Perto de
 * uma divisa a malha pode errar por alguns metros, então ali a pessoa pode escolher entre as
 * cidades vizinhas; a API confere de novo.
 */
export function usePlaceCity(point: MapPoint | null): PlaceCityState {
  const [chosen, setChosen] = useState<string | null>(null);
  const candidates = point ? municipalitiesNear(point) : [];
  const confirmed = chosen && candidates.some((item) => item.code === chosen) ? chosen : null;
  const city = confirmed
    ? municipalityByCode(confirmed)
    : point
      ? (municipalityAt(point) ?? null)
      : null;
  return { city, candidates, choose: setChosen };
}

/**
 * Linha "Cidade: Castanhal · Trocar" do cadastro. Trocar para uma vizinha confirma a divisa;
 * trocar para uma cidade longe leva o mapa até lá (`onJump`), para a pessoa marcar o ponto.
 */
export function PlaceCity({
  state,
  onJump,
}: {
  state: PlaceCityState;
  onJump: (city: Municipality) => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const { city, candidates } = state;
  const border = candidates.length > 1;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Icon name="map" color={colors.primary} />
        <AppText variant="bodyStrong" style={styles.text} accessibilityLiveRegion="polite">
          {city ? `Cidade: ${city.name}` : 'Marque o ponto numa das cidades atendidas'}
        </AppText>
        <Button
          title={city ? 'Trocar' : 'Escolher cidade'}
          variant="ghost"
          onPress={() => setOpen(true)}
        />
      </View>
      {border && city ? (
        <Notice
          tone="warning"
          message={`Esse ponto fica perto da divisa entre ${candidates
            .map((item) => item.name)
            .join(' e ')}. Confira se a cidade está certa.`}
        />
      ) : null}
      <CitySheet
        visible={open}
        current={city?.code ?? null}
        title={border ? 'Qual é a cidade deste ponto?' : 'Em que cidade está o animal?'}
        onClose={() => setOpen(false)}
        onChoose={(next) => {
          setOpen(false);
          if (candidates.some((item) => item.code === next.code)) {
            state.choose(next.code);
            return;
          }
          // Cidade longe do ponto: leva o mapa até lá e a pessoa ajusta o ponto.
          state.choose(null);
          onJump(next);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1 },
});
