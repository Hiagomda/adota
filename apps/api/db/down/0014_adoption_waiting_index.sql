-- migrate:no-transaction
DROP INDEX CONCURRENTLY IF EXISTS posts_parent_status_idx;
