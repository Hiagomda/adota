export interface VolunteerSettings {
  isTransportAvailable: boolean;
  isFosterAvailable: boolean;
  fosterPetTypes: ('dog' | 'cat' | 'other')[];
  fosterMaxDays: number | null;
  serviceRadiusKm: number;
}

export interface VolunteerBadge {
  code: 'local_hero' | 'good_pilot' | 'open_doors' | 'top_sponsor' | 'neighborhood_scout';
  name: string;
  unlockedAt: string | null;
}

export interface VolunteerStatus {
  settings: VolunteerSettings;
  xp: number;
  level: {
    code: string;
    name: string;
    floor: number;
    ceiling: number | null;
    progress: number;
  };
  badges: VolunteerBadge[];
  pointsAwarded?: number;
}
