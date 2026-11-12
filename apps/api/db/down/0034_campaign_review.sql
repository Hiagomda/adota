-- Volta a regra antiga da justificativa sem barrar as campanhas curtas que já existem.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_purpose_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_purpose_check
  CHECK (char_length(purpose) BETWEEN 30 AND 2000) NOT VALID;
DROP INDEX IF EXISTS campaigns_review_idx;
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS banner_color,
  DROP COLUMN IF EXISTS banner_key,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS review_status;
