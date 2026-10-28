import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { logBestEffort } from '../crash/bestEffort';
import { tipHidden, TIP_SNOOZE_MS, type CupuTipContext } from './tips';

const enabledKey = '@egua_adota:cupu_tips_enabled';
const hiddenKey = (context: CupuTipContext) => `@egua_adota:cupu_tip_hidden:${context}`;
const contexts: CupuTipContext[] = ['adoption', 'fairs', 'network'];

interface CupuTipsState {
  loaded: boolean;
  enabled: boolean;
  hidden: Partial<Record<CupuTipContext, boolean>>;
  load: () => Promise<void>;
  setEnabled: (value: boolean) => void;
  snooze: (context: CupuTipContext) => void;
}

/** Liga e desliga as dicas (Ajustes) e lembra quais telas a pessoa mandou calar por uns dias. */
export const useCupuTips = create<CupuTipsState>((set, get) => ({
  loaded: false,
  enabled: true,
  hidden: {},
  load: async () => {
    if (get().loaded) return;
    const now = Date.now();
    const [enabled, ...hidden] = await Promise.all([
      AsyncStorage.getItem(enabledKey),
      ...contexts.map((context) => AsyncStorage.getItem(hiddenKey(context))),
    ]);
    set({
      loaded: true,
      enabled: enabled !== 'false',
      hidden: Object.fromEntries(
        contexts.map((context, index) => [context, tipHidden(hidden[index] ?? null, now)]),
      ),
    });
  },
  setEnabled: (value) => {
    set({ enabled: value });
    void AsyncStorage.setItem(enabledKey, String(value)).catch(logBestEffort('cupu:tips-enabled'));
  },
  snooze: (context) => {
    set((state) => ({ hidden: { ...state.hidden, [context]: true } }));
    void AsyncStorage.setItem(hiddenKey(context), String(Date.now() + TIP_SNOOZE_MS)).catch(
      logBestEffort('cupu:tip-snooze'),
    );
  },
}));
