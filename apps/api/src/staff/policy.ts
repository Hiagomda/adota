import { HttpError } from '../http.js';

/** Named permissions. Routes check these, not a raw role string. */
export const permissions = [
  'audit.read',
  'team.read',
  'team.manage',
  'session.revoke_own',
] as const;
export type Permission = (typeof permissions)[number];

export const staffRoles = [
  'moderator',
  'support',
  'ong_reviewer',
  'finance_reviewer',
  'admin',
  'superadmin',
] as const;
export type StaffRole = (typeof staffRoles)[number];

export const assignableRoles = [
  'user',
  'protector',
  'ngo',
  'moderator',
  'support',
  'ong_reviewer',
  'finance_reviewer',
  'admin',
  'superadmin',
] as const;
export type AssignableRole = (typeof assignableRoles)[number];

const byRole: Record<StaffRole, readonly Permission[]> = {
  moderator: ['session.revoke_own'],
  support: ['session.revoke_own'],
  ong_reviewer: ['session.revoke_own'],
  finance_reviewer: ['session.revoke_own'],
  admin: ['session.revoke_own', 'audit.read', 'team.read'],
  superadmin: ['session.revoke_own', 'audit.read', 'team.read', 'team.manage'],
};

export function isStaffRole(role: string): role is StaffRole {
  return (staffRoles as readonly string[]).includes(role);
}

export function permissionsFor(role: string): readonly Permission[] {
  if (!isStaffRole(role)) return [];
  return byRole[role];
}

export function assertPermission(role: string, permission: Permission): void {
  if (!permissionsFor(role).includes(permission)) {
    throw new HttpError(403, 'Você não pode fazer isso.');
  }
}

export function requirePresentedCredential(token: string | null | undefined): string {
  if (!token) throw new HttpError(401, 'Entre de novo no painel.');
  return token;
}

/**
 * Superadmin-only role change. The last superadmin cannot be demoted.
 * The same role is a no-op. A stale expected role is a conflict.
 */
export function decideRoleChange(input: {
  actorRole: string;
  actorId: string;
  targetId: string;
  currentRole: string;
  nextRole: string;
  expectedRole: string;
  activeSuperadmins: number;
  recentTotp: boolean;
  justification: string;
}): { changed: boolean } {
  assertPermission(input.actorRole, 'team.manage');
  if (!(assignableRoles as readonly string[]).includes(input.nextRole)) {
    throw new HttpError(400, 'Papel inválido.');
  }
  if (input.expectedRole !== input.currentRole) {
    throw new HttpError(409, 'Outra pessoa alterou esse papel. Atualize a lista e tente de novo.');
  }
  if (input.currentRole === input.nextRole) return { changed: false };
  const justification = input.justification.trim();
  if (justification.length < 10) {
    throw new HttpError(400, 'Escreva o motivo, com pelo menos 10 caracteres.');
  }
  if (!input.recentTotp) {
    throw new HttpError(401, 'Confirme com o código do autenticador.');
  }
  const removesLastSuperadmin =
    input.currentRole === 'superadmin' &&
    input.nextRole !== 'superadmin' &&
    input.activeSuperadmins <= 1;
  if (removesLastSuperadmin) {
    throw new HttpError(403, 'O último superadmin não pode ser rebaixado.');
  }
  if (
    input.actorId === input.targetId &&
    input.nextRole !== 'superadmin' &&
    input.activeSuperadmins <= 1
  ) {
    throw new HttpError(403, 'O último superadmin não pode ser rebaixado.');
  }
  return { changed: true };
}
