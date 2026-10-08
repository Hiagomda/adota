import { create } from 'zustand';

interface AvailabilityState {
  transport: boolean;
  foster: boolean;
  sync: (transport: boolean, foster: boolean) => void;
  setTransport: (value: boolean) => void;
  setFoster: (value: boolean) => void;
}

export const useVolunteerAvailability = create<AvailabilityState>((set) => ({
  transport: false,
  foster: false,
  sync: (transport, foster) => set({ transport, foster }),
  setTransport: (transport) => set({ transport }),
  setFoster: (foster) => set({ foster }),
}));
