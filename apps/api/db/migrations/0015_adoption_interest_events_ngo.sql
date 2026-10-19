-- Ficha de quem quer adotar: as respostas vão junto com a primeira mensagem no WhatsApp e
-- ficam para quem cuida rever. Uma por pessoa e animal; responder de novo atualiza.
CREATE TABLE IF NOT EXISTS adoption_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS adoption_interests_post_idx ON adoption_interests (post_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS adoption_interests_user_idx ON adoption_interests (user_id, updated_at DESC);

-- Feiras de adoção de ONGs e protetores verificados.
CREATE TABLE IF NOT EXISTS adoption_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  place_label text NOT NULL CHECK (char_length(place_label) BETWEEN 1 AND 160),
  location geography(Point, 4326) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS adoption_events_upcoming_idx ON adoption_events (ends_at, starts_at)
  WHERE hidden = false;

-- Cadastro de ONG: o que a equipe precisa para conferir o pedido de selo.
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ngo'
  CHECK (kind IN ('ngo', 'protector'));
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS instagram text
  CHECK (instagram IS NULL OR char_length(instagram) <= 60);
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS cnpj text
  CHECK (cnpj IS NULL OR char_length(cnpj) = 14);
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS neighborhood text
  CHECK (neighborhood IS NULL OR char_length(neighborhood) <= 80);
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS decided_at timestamptz;

CREATE INDEX IF NOT EXISTS verification_requests_user_idx ON verification_requests (user_id, created_at DESC);
