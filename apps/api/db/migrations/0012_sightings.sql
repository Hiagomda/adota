-- "Vi esse animal": someone saw it somewhere else, without promising to go.
CREATE TABLE IF NOT EXISTS sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  location geography(Point, 4326) NOT NULL,
  approx_label text CHECK (approx_label IS NULL OR char_length(approx_label) <= 120),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sightings_post_created_idx ON sightings (post_id, created_at DESC);
