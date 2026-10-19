import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http.js';
import { decideRoleChange, permissionsFor, assertPermission } from '../src/staff/policy.js';
import { hashPassword, verifyPassword } from '../src/staff/password.js';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';

describe('staff permissions', () => {
  it('gives team management only to the superadmin', () => {
    expect(permissionsFor('user')).toEqual([]);
    expect(permissionsFor('moderator')).not.toContain('team.manage');
    expect(permissionsFor('finance_reviewer')).not.toContain('audit.read');
    expect(permissionsFor('admin')).toContain('audit.read');
    expect(permissionsFor('admin')).not.toContain('team.manage');
    expect(permissionsFor('superadmin')).toContain('team.manage');
    expect(() => assertPermission('admin', 'team.manage')).toThrow(HttpError);
    expect(() => assertPermission('support', 'audit.read')).toThrow(HttpError);
  });

  it('divide a moderação por função', () => {
    expect(permissionsFor('moderator')).toContain('reports.manage');
    expect(permissionsFor('moderator')).toContain('users.suspend');
    expect(permissionsFor('moderator')).not.toContain('verifications.manage');
    expect(permissionsFor('ong_reviewer')).toContain('verifications.manage');
    expect(permissionsFor('ong_reviewer')).not.toContain('reports.manage');
    expect(permissionsFor('support')).toContain('users.read');
    expect(permissionsFor('support')).not.toContain('users.suspend');
    expect(permissionsFor('finance_reviewer')).toEqual(['session.revoke_own', 'overview.read']);
    for (const role of ['admin', 'superadmin']) {
      expect(permissionsFor(role)).toEqual(
        expect.arrayContaining([
          'overview.read',
          'reports.manage',
          'verifications.manage',
          'posts.moderate',
          'users.read',
          'users.suspend',
        ]),
      );
    }
    expect(permissionsFor('ngo')).toEqual([]);
  });

  it('refuses the last superadmin demotion and a stale role', () => {
    expect(() =>
      decideRoleChange({
        actorRole: 'admin',
        actorId: actor,
        targetId: target,
        currentRole: 'ong_reviewer',
        nextRole: 'finance_reviewer',
        expectedRole: 'ong_reviewer',
        activeSuperadmins: 1,
        recentAuth: true,
        justification: 'Separar a revisão do Pix.',
      }),
    ).toThrow(HttpError);

    expect(() =>
      decideRoleChange({
        actorRole: 'superadmin',
        actorId: actor,
        targetId: target,
        currentRole: 'superadmin',
        nextRole: 'admin',
        expectedRole: 'superadmin',
        activeSuperadmins: 1,
        recentAuth: true,
        justification: 'Não deveria rebaixar o último.',
      }),
    ).toThrow(HttpError);

    expect(() =>
      decideRoleChange({
        actorRole: 'superadmin',
        actorId: actor,
        targetId: target,
        currentRole: 'admin',
        nextRole: 'moderator',
        expectedRole: 'support',
        activeSuperadmins: 2,
        recentAuth: true,
        justification: 'Papel desatualizado na tela.',
      }),
    ).toThrow(HttpError);

    expect(
      decideRoleChange({
        actorRole: 'superadmin',
        actorId: actor,
        targetId: target,
        currentRole: 'admin',
        nextRole: 'admin',
        expectedRole: 'admin',
        activeSuperadmins: 1,
        recentAuth: false,
        justification: '',
      }).changed,
    ).toBe(false);
  });

  it('accepts a justified change after a fresh code', () => {
    const decision = decideRoleChange({
      actorRole: 'superadmin',
      actorId: actor,
      targetId: target,
      currentRole: 'admin',
      nextRole: 'moderator',
      expectedRole: 'admin',
      activeSuperadmins: 1,
      recentAuth: true,
      justification: 'Esta pessoa só modera denúncias.',
    });
    expect(decision.changed).toBe(true);
  });
});

describe('senha da equipe', () => {
  it('confere a senha certa e recusa a errada e o hash estranho', async () => {
    const stored = await hashPassword('égua-adota-2026');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('égua-adota-2026', stored)).toBe(true);
    expect(await verifyPassword('égua-adota-2025', stored)).toBe(false);
    expect(await verifyPassword('égua-adota-2026', 'md5$abc')).toBe(false);
    expect(await hashPassword('égua-adota-2026')).not.toBe(stored);
  });
});
