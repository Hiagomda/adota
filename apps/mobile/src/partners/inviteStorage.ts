import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { logBestEffort } from '../crash/bestEffort';
import type { InviteMemory } from './partners';

const firstSeenKey = '@egua_adota:partner_invite_first_seen';
const lastShownKey = '@egua_adota:partner_invite_last_shown';
const mutedKey = '@egua_adota:partner_invite_muted';

interface PartnerInviteState extends InviteMemory {
  loaded: boolean;
  load: () => Promise<void>;
  markShown: () => void;
  mute: () => void;
}

function readNumber(value: string | null): number | null {
  const number = value === null ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Lembra quando o convite "Anuncie aqui" apareceu, para ele não virar chatice. */
export const usePartnerInvite = create<PartnerInviteState>((set, get) => ({
  loaded: false,
  firstSeenAt: null,
  lastShownAt: null,
  muted: false,
  load: async () => {
    if (get().loaded) return;
    const [firstSeen, lastShown, muted] = await Promise.all([
      AsyncStorage.getItem(firstSeenKey),
      AsyncStorage.getItem(lastShownKey),
      AsyncStorage.getItem(mutedKey),
    ]);
    let firstSeenAt = readNumber(firstSeen);
    if (firstSeenAt === null) {
      firstSeenAt = Date.now();
      void AsyncStorage.setItem(firstSeenKey, String(firstSeenAt)).catch(
        logBestEffort('partners:first-seen'),
      );
    }
    set({ loaded: true, firstSeenAt, lastShownAt: readNumber(lastShown), muted: muted === 'true' });
  },
  markShown: () => {
    const now = Date.now();
    set({ lastShownAt: now });
    void AsyncStorage.setItem(lastShownKey, String(now)).catch(logBestEffort('partners:shown'));
  },
  mute: () => {
    set({ muted: true });
    void AsyncStorage.setItem(mutedKey, 'true').catch(logBestEffort('partners:mute'));
  },
}));
