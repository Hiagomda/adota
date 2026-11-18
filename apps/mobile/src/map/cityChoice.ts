import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';
import { logBestEffort } from '../crash/bestEffort';
import { DEFAULT_CITY } from './cityFrame';
import { municipalityByCode, type Municipality } from './serviceArea';

const cityKey = '@egua_adota:map_city';

interface CityState {
  city: Municipality;
  /** Já leu a escolha guardada (ou não havia nenhuma). */
  loaded: boolean;
  choose: (city: Municipality) => void;
}

/** A cidade que a pessoa escolheu no mapa. Sem escolha, Belém. Fica guardada no aparelho. */
export const useCityChoice = create<CityState>((set) => ({
  city: DEFAULT_CITY,
  loaded: false,
  choose: (city) => {
    set({ city, loaded: true });
    void AsyncStorage.setItem(cityKey, city.code).catch(logBestEffort('map:city-save'));
  },
}));

let reading: Promise<void> | null = null;

/** Lê a cidade guardada uma vez por abertura do app. */
export function useSavedCity(): CityState {
  const state = useCityChoice();
  useEffect(() => {
    if (reading) return;
    reading = AsyncStorage.getItem(cityKey)
      .then((code) => {
        const saved = municipalityByCode(code);
        if (saved && !useCityChoice.getState().loaded) useCityChoice.setState({ city: saved });
      })
      .catch(logBestEffort('map:city-read'))
      .finally(() => useCityChoice.setState({ loaded: true }));
  }, []);
  return state;
}
