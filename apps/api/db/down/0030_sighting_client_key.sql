-- migrate:no-transaction
DROP INDEX CONCURRENTLY IF EXISTS sightings_user_client_key_idx;
ALTER TABLE sightings DROP COLUMN IF EXISTS client_key;
