-- migrate:no-transaction
-- Feed counts look up likes, comments and saves by post. Those primary keys
-- lead with user_id, so a count by post cannot use them.
CREATE INDEX CONCURRENTLY IF NOT EXISTS likes_post_id_idx ON likes (post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS comments_post_visible_idx ON comments (post_id) WHERE hidden = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS saves_post_id_idx ON saves (post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS blocks_blocked_id_idx ON blocks (blocked_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_public_feed_idx ON posts (
  ((CASE urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END)),
  boosted DESC,
  created_at DESC,
  id DESC
) WHERE hidden = false AND review_status = 'published' AND parent_post_id IS NULL;
