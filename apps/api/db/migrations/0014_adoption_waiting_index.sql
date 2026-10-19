-- migrate:no-transaction
-- "Esperando há mais tempo" procura, por animal, a última linha do diário que o pôs para adoção.
-- O diário também é lido por post na tela do animal.
CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_parent_status_idx
  ON posts (parent_post_id, status, created_at DESC)
  WHERE parent_post_id IS NOT NULL;
