import { HttpError } from './http.js';
import type { SessionUser } from './session.js';

/** Roles stored today. `ong` in the product language is `ngo` in the database. */
export const roles = ['user', 'protector', 'ngo', 'moderator', 'admin'] as const;
export type Role = (typeof roles)[number];

export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.');
  return user;
}

/** Central role check. Every protected route calls this or `requireUser`. */
export function requireRole(user: SessionUser | null, allowed: readonly Role[]): SessionUser {
  const current = requireUser(user);
  if (!allowed.includes(current.role as Role)) {
    throw new HttpError(403, 'Você não pode fazer isso.');
  }
  return current;
}

export function requireAdmin(user: SessionUser | null): SessionUser {
  const current = requireUser(user);
  if (current.role !== 'admin') {
    throw new HttpError(403, 'Só a equipe da Égua, adota! pode fazer isso.');
  }
  return current;
}
