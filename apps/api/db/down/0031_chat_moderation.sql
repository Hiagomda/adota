DELETE FROM reports WHERE target_type = 'adoption_thread';
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('post', 'comment', 'user', 'campaign'));

ALTER TABLE users
  DROP COLUMN IF EXISTS chat_notice_version,
  DROP COLUMN IF EXISTS chat_notice_at;

DROP INDEX IF EXISTS adoption_threads_last_message_idx;
DROP INDEX IF EXISTS adoption_threads_flagged_idx;

-- Mensagens barradas nunca foram entregues: saem junto com as colunas da moderação.
DELETE FROM adoption_messages WHERE withheld = true;

ALTER TABLE adoption_threads
  DROP COLUMN IF EXISTS last_message_at,
  DROP COLUMN IF EXISTS closed_reason,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS flagged_at,
  DROP COLUMN IF EXISTS review_status;

ALTER TABLE adoption_messages
  DROP COLUMN IF EXISTS hidden_by,
  DROP COLUMN IF EXISTS hidden_at,
  DROP COLUMN IF EXISTS withheld,
  DROP COLUMN IF EXISTS flags;
