import type { AnimalCare } from './post/care';

export interface Account {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  role: string;
  verified: boolean;
  city: string | null;
  alertRadiusKm: number;
  notificationsEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  whatsappOptIn: boolean;
  /** Stored as 55 + digits. Older API builds did not send it. */
  phone?: string | null;
}

export interface Post {
  id: string;
  type: string;
  urgency: 'low' | 'medium' | 'high';
  description: string;
  approxLabel: string;
  status: string;
  createdAt: string;
  boosted: boolean;
  author: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    role: string;
    verified: boolean;
    phone: string | null;
  };
  animal: {
    id: string;
    species: string;
    size: string;
    name: string | null;
    sex: string;
    ageEstimate: string | null;
    healthNotes: string | null;
    /** Older API builds did not send it. */
    care?: AnimalCare;
    temperament: string | null;
  };
  location: { latitude: number; longitude: number; exact: boolean };
  accuracyM: number | null;
  addressText: string | null;
  referencePoint: string | null;
  media: { url: string; thumbUrl: string; storageKey: string | null }[];
  counts: { likes: number; comments: number };
  liked: boolean;
  saved: boolean;
  viewerWillHelp: boolean;
  /** Desde quando espera um lar; só para adoção. Versões antigas da API não mandam. */
  adoptionSince?: string | null;
  /** People on the way right now. Only the single-post endpoint sends it. */
  helpersCount?: number;
  helpRequest: {
    kind: string;
    goalAmount: string | null;
    pixKey: string | null;
    deadline: string | null;
    paymentNotice: string;
  } | null;
  updates?: {
    id: string;
    description: string;
    status?: string;
    /** Older API builds did not send it: treat as a note. */
    kind?: 'not_found' | 'status' | 'note';
    photo?: { url: string; thumbUrl: string } | null;
    createdAt: string;
    author: { name: string; handle: string };
  }[];
}

export interface AppNotification {
  id: string;
  type: string;
  payload: { title?: string; body?: string; postId?: string; adopterId?: string; route?: string };
  readAt: string | null;
  createdAt: string;
}
