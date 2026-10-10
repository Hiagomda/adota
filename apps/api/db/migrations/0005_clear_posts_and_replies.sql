-- One-time cleanup of leftover demo and test posts, plus comment replies.
UPDATE posts SET parent_post_id = NULL WHERE parent_post_id IS NOT NULL;
DELETE FROM posts;
DELETE FROM animals;

UPDATE volunteer_profiles SET is_transport_available = false;

ALTER TABLE comments
  ADD COLUMN parent_comment_id uuid REFERENCES comments (id) ON DELETE CASCADE;
