import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runsOutsideTransaction, sqlStatements } from '../scripts/migrate.js';

describe('concurrent migrations', () => {
  it('keeps ordinary files inside a transaction', () => {
    expect(runsOutsideTransaction('CREATE INDEX posts_idx ON posts (id);')).toBe(false);
  });

  it('splits index statements and drops comment-only chunks', () => {
    const sql = `-- migrate:no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS likes_post_id_idx ON likes (post_id);
-- note
CREATE INDEX CONCURRENTLY IF NOT EXISTS saves_post_id_idx ON saves (post_id);
`;
    expect(runsOutsideTransaction(sql)).toBe(true);
    const statements = sqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('likes_post_id_idx');
    expect(statements[1]).toContain('saves_post_id_idx');
  });

  it('splits the feed migration into one concurrent index each', () => {
    const sql = readFileSync(new URL('../db/migrations/0009_feed_indexes.sql', import.meta.url), 'utf8');
    const statements = sqlStatements(sql);
    expect(statements).toHaveLength(5);
    expect(statements.every((part) => part.includes('CREATE INDEX CONCURRENTLY'))).toBe(true);
  });
});
