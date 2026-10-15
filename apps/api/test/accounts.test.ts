import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createFirebaseUser, firstHandle } from '../src/accounts.js';

function poolFailing(errors: unknown[]) {
  const handles: string[] = [];
  const pool = {
    query: async (_sql: string, params: unknown[]) => {
      handles.push(String(params[2]));
      const next = errors.shift();
      if (next) throw next;
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pool;
  return { pool, handles };
}

const taken = Object.assign(new Error('duplicate key'), { code: '23505' });

describe('first sign-in', () => {
  it('derives a lowercase @ from the e-mail and the uid', () => {
    expect(firstHandle('Maria.Silva@gmail.com', 'AbC9xyz')).toBe('mariasilvaabc9');
    expect(firstHandle(undefined, 'Zz12')).toBe('pessoazz12');
  });

  it('tries another @ when the first one is taken instead of failing the login', async () => {
    const { pool, handles } = poolFailing([taken]);
    await createFirebaseUser(pool, {
      uid: 'abcd1234',
      name: 'Ana',
      email: 'ana@x.com',
      role: 'user',
    });
    expect(handles).toHaveLength(2);
    expect(handles[0]).toBe('anaabcd');
    expect(handles[1]).toMatch(/^anaabcd\d{4}$/);
  });

  it('lets a database failure reach the caller', async () => {
    const down = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    const { pool } = poolFailing([down]);
    await expect(
      createFirebaseUser(pool, { uid: 'abcd1234', name: 'Ana', email: 'ana@x.com', role: 'user' }),
    ).rejects.toThrow('connection refused');
  });
});
