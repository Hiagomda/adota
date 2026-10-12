import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http.js';
import { decideRoleChange, permissionsFor, assertPermission } from '../src/staff/policy.js';
import {
  decryptSecret,
  encryptSecret,
  readStaffTicket,
  signStaffTicket,
  totpCode,
  totpMatches,
} from '../src/staff/totp.js';

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
        recentTotp: true,
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
        recentTotp: true,
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
        recentTotp: true,
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
        recentTotp: false,
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
      recentTotp: true,
      justification: 'Esta pessoa só modera denúncias.',
    });
    expect(decision.changed).toBe(true);
  });
});

describe('totp', () => {
  it('matches the RFC 6238 vector and rejects another code', () => {
    const secret = Buffer.from('12345678901234567890', 'ascii');
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpMatches(secret, '287082', 59_000)).toBe(true);
    expect(totpMatches(secret, '000000', 59_000)).toBe(false);
  });

  it('round-trips the encrypted secret and the short-lived ticket', () => {
    const key = Buffer.alloc(32, 7);
    const secret = Buffer.from('12345678901234567890', 'ascii');
    expect(decryptSecret(key, encryptSecret(key, secret)).equals(secret)).toBe(true);
    const token = signStaffTicket(key, { sub: actor, purpose: 'totp', exp: 5_000 });
    expect(readStaffTicket(key, token, 'totp', 4_000).sub).toBe(actor);
    expect(() => readStaffTicket(key, token, 'enroll', 4_000)).toThrow(HttpError);
    expect(() => readStaffTicket(key, token, 'totp', 5_001)).toThrow(HttpError);
  });
});
