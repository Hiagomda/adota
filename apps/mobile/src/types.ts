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
    sex: string;
    ageEstimate: string | null;
    healthNotes: string | null;
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
    createdAt: string;
    author: { name: string; handle: string };
  }[];
}

export interface AppNotification {
  id: string;
  type: string;
  payload: { title?: string; body?: string; postId?: string };
  readAt: string | null;
  createdAt: string;
}
