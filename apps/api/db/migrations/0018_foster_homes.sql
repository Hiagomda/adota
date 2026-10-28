-- Casas Amigas com vagas: capacidade, portes, necessidades especiais, ofertas e pedidos de
-- acolhimento. Colunas novas com padrão: o PUT /volunteers/settings dos APKs antigos continua
-- gravando só as colunas que conhece. Faça o backup antes de aplicar em produção.
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS foster_capacity integer NOT NULL DEFAULT 1
  CHECK (foster_capacity BETWEEN 1 AND 20);
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS foster_sizes jsonb NOT NULL
  DEFAULT '["small", "medium", "large"]'::jsonb;
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS foster_special_needs boolean NOT NULL DEFAULT false;
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS foster_offers jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS foster_notes text
  CHECK (foster_notes IS NULL OR char_length(foster_notes) <= 300);
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Um pedido de acolhimento por animal e casa. "approved" ocupa uma vaga até terminar.
CREATE TABLE IF NOT EXISTS foster_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foster_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES animals (id) ON DELETE CASCADE,
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'declined', 'cancelled', 'ended')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 300),
  response_note text CHECK (response_note IS NULL OR char_length(response_note) <= 300),
  expected_days integer CHECK (expected_days IS NULL OR expected_days BETWEEN 1 AND 365),
  special_care boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  ended_at timestamptz,
  closed_by uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS foster_stays_open_pair_idx
  ON foster_stays (foster_id, post_id) WHERE status IN ('requested', 'approved');
CREATE INDEX IF NOT EXISTS foster_stays_foster_idx ON foster_stays (foster_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS foster_stays_requester_idx ON foster_stays (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS foster_stays_animal_idx ON foster_stays (animal_id) WHERE status = 'approved';
