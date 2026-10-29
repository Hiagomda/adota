-- Busca inteligente de animais perdidos. Tudo novo e opcional: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).

-- Cores do pelo marcadas no cadastro. Vazio quer dizer que ninguém marcou (posts antigos).
ALTER TABLE animals ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT '{}';
ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_colors_check;
ALTER TABLE animals ADD CONSTRAINT animals_colors_check CHECK (
  cardinality(colors) <= 3
  AND colors <@ ARRAY['black', 'white', 'gray', 'brown', 'caramel', 'ginger', 'cream', 'brindle']::text[]
);

-- Faixas de cor da primeira foto de cada post (7 números que somam 1), calculadas pelo servidor
-- com uma miniatura do imgproxy. A foto guardada serve para saber quando recalcular.
CREATE TABLE IF NOT EXISTS post_photo_palettes (
  post_id uuid PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
  media_url text NOT NULL,
  palette real[] NOT NULL CHECK (cardinality(palette) = 7),
  computed_at timestamptz NOT NULL DEFAULT now()
);

-- Sugestão de que um perdido e um animal encontrado ou visto podem ser o mesmo. Nunca é
-- identificação: o tutor confirma ou descarta. Um par aparece uma vez só.
CREATE TABLE IF NOT EXISTS lost_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  found_post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  distance_km real NOT NULL CHECK (distance_km >= 0),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'dismissed', 'confirmed')),
  decided_by uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lost_post_id, found_post_id),
  CHECK (lost_post_id <> found_post_id)
);

CREATE INDEX IF NOT EXISTS lost_matches_lost_idx ON lost_matches (lost_post_id, score DESC);
CREATE INDEX IF NOT EXISTS lost_matches_found_idx ON lost_matches (found_post_id, score DESC);
-- Os perdidos ainda procurando, para cruzar com cada animal novo.
CREATE INDEX IF NOT EXISTS posts_lost_open_idx ON posts (created_at DESC)
  WHERE type = 'lost' AND parent_post_id IS NULL AND status = 'open';
