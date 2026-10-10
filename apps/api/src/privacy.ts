import { HttpError } from './http.js';
import type { SessionUser } from './session.js';

export function canSeeExactPlace(
  viewer: SessionUser | null,
  authorId: string,
  viewerWillHelp: boolean,
): boolean {
  return viewer !== null && (viewer.id === authorId || viewer.role === 'admin' || viewerWillHelp);
}

/** Street, GPS accuracy and the reference stay with the people allowed to see the exact pin. */
export function publicPlace(
  exact: boolean,
  place: {
    accuracyM: number | null;
    addressText: string | null;
    referencePoint: string | null;
  },
): { accuracyM: number | null; addressText: string | null; referencePoint: string | null } {
  if (!exact) return { accuracyM: null, addressText: null, referencePoint: null };
  return place;
}

/** Pix is public only on a help request from a verified profile. */
export function publicPixKey(authorVerified: boolean, pixKey: string | null): string | null {
  if (!authorVerified) return null;
  return pixKey;
}

export function assertHelpRequest(
  user: SessionUser,
  input: { type: string; helpRequest?: unknown },
): void {
  if (!input.helpRequest) return;
  if (input.type === 'help_request' && user.verified) return;
  throw new HttpError(403, 'Só perfis verificados podem publicar pedidos de ajuda com Pix.');
}
