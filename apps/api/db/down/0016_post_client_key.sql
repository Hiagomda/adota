-- migrate:no-transaction
DROP INDEX CONCURRENTLY IF EXISTS posts_author_client_key_idx;
ALTER TABLE posts DROP COLUMN IF EXISTS client_key;
