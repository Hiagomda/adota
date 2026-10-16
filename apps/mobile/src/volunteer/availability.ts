import { create } from 'zustand';

interface AvailabilityState {
  foster: boolean;
  sync: (foster: boolean) => void;
  setFoster: (value: boolean) => void;
}

export const useVolunteerAvailability = create<AvailabilityState>((set) => ({
  foster: false,
  sync: (foster) => set({ foster }),
  setFoster: (foster) => set({ foster }),
}));
