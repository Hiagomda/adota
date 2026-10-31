-- Parceiros do Cupu: petshops, clínicas e lojas que aparecem no mapa e em cartões de anúncio.
-- O app não recebe dinheiro: o parceiro entra de graça oferecendo uma vantagem a quem adota ou
-- resgata, e a equipe aprova antes de aparecer. Tudo novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quem pediu e cuida do cadastro.
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('petshop', 'vet', 'clinic_24h', 'feed_store', 'grooming', 'other')),
  about text CHECK (about IS NULL OR char_length(about) <= 300),
  perk text NOT NULL CHECK (char_length(perk) BETWEEN 5 AND 200),
  hours text CHECK (hours IS NULL OR char_length(hours) <= 120),
  address_text text NOT NULL CHECK (char_length(address_text) <= 160),
  -- Loja é lugar público: o ponto aparece exato, diferente de casa de gente.
  location geography(Point, 4326) NOT NULL,
  whatsapp text NOT NULL CHECK (whatsapp ~ '^55[0-9]{10,11}$'),
  instagram text CHECK (instagram IS NULL OR instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paused')),
  -- Quem pediu pode tirar do mapa por um tempo (férias, reforma) sem passar pela equipe.
  owner_paused boolean NOT NULL DEFAULT false,
  -- Escolhido pela equipe para os cartões "Parceiro do bem" no feed.
  featured boolean NOT NULL DEFAULT false,
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 300),
  reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partners_location_idx ON partners USING gist (location)
  WHERE status = 'approved' AND owner_paused = false;
CREATE INDEX IF NOT EXISTS partners_user_idx ON partners (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partners_review_idx ON partners (status, created_at);

-- Números que o parceiro vê: quantas pessoas abriram o cartão, chamaram no WhatsApp ou pediram
-- a rota. Só contagem por dia, sem saber quem foi.
CREATE TABLE IF NOT EXISTS partner_daily_stats (
  partner_id uuid NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  whatsapp_taps integer NOT NULL DEFAULT 0,
  route_taps integer NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_id, day)
);
