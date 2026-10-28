import { HttpError } from '../http.js';

/** Permissões nomeadas. As rotas conferem estas, nunca o papel cru. */
export const permissions = [
  'audit.read',
  'team.read',
  'team.manage',
  'session.revoke_own',
  'overview.read',
  'reports.manage',
  'verifications.manage',
  'posts.moderate',
  'users.read',
  'users.suspend',
  'campaigns.review',
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

const moderation: readonly Permission[] = [
  'overview.read',
  'reports.manage',
  'verifications.manage',
  'posts.moderate',
  'users.read',
  'users.suspend',
];

const byRole: Record<StaffRole, readonly Permission[]> = {
  moderator: [
    'session.revoke_own',
    'overview.read',
    'reports.manage',
    'posts.moderate',
    'users.read',
    'users.suspend',
  ],
  support: ['session.revoke_own', 'overview.read', 'users.read'],
  ong_reviewer: ['session.revoke_own', 'overview.read', 'verifications.manage', 'users.read'],
  finance_reviewer: ['session.revoke_own', 'overview.read', 'campaigns.review'],
  admin: ['session.revoke_own', 'audit.read', 'team.read', 'campaigns.review', ...moderation],
  superadmin: [
    'session.revoke_own',
    'audit.read',
    'team.read',
    'team.manage',
    'campaigns.review',
    ...moderation,
  ],
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
 * Troca de papel só pelo superadmin. O último superadmin não pode ser rebaixado.
 * O mesmo papel não muda nada. Papel esperado desatualizado é conflito.
 */
export function decideRoleChange(input: {
  actorRole: string;
  actorId: string;
  targetId: string;
  currentRole: string;
  nextRole: string;
  expectedRole: string;
  activeSuperadmins: number;
  recentAuth: boolean;
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
  if (!input.recentAuth) {
    throw new HttpError(403, 'Confirme com a sua senha.');
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
