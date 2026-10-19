DROP INDEX IF EXISTS verification_requests_user_idx;
ALTER TABLE verification_requests DROP COLUMN IF EXISTS decided_at;
ALTER TABLE verification_requests DROP COLUMN IF EXISTS neighborhood;
ALTER TABLE verification_requests DROP COLUMN IF EXISTS cnpj;
ALTER TABLE verification_requests DROP COLUMN IF EXISTS instagram;
ALTER TABLE verification_requests DROP COLUMN IF EXISTS kind;
DROP TABLE IF EXISTS adoption_events;
DROP TABLE IF EXISTS adoption_interests;
