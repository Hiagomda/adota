export interface SessionUser {
  id: string;
  firebaseUid: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  phone: string | null;
  whatsappOptIn: boolean;
  role: string;
  verified: boolean;
  suspended: boolean;
  city: string | null;
  alertRadiusKm: number;
  notificationsEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export function rowsOf<T>(result: unknown): T[] {
  if (
    typeof result === 'object' &&
    result !== null &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as T[];
  }
  return [];
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatarUrl: user.avatarUrl,
    role: user.role,
    verified: user.verified,
    city: user.city,
    alertRadiusKm: user.alertRadiusKm,
    notificationsEnabled: user.notificationsEnabled,
    quietHoursStart: user.quietHoursStart,
    quietHoursEnd: user.quietHoursEnd,
    whatsappOptIn: user.whatsappOptIn,
  };
}
