-- migrate:no-transaction
DROP INDEX CONCURRENTLY IF EXISTS posts_public_feed_idx;
DROP INDEX CONCURRENTLY IF EXISTS blocks_blocked_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS saves_post_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS comments_post_visible_idx;
DROP INDEX CONCURRENTLY IF EXISTS likes_post_id_idx;
