ALTER TABLE posts
  ADD COLUMN accuracy_m double precision,
  ADD COLUMN address_text text,
  ADD COLUMN reference_point text;

ALTER TABLE posts
  ADD CONSTRAINT posts_accuracy_m_check CHECK (accuracy_m IS NULL OR accuracy_m >= 0);
