-- Pontos solidários: potes de ração e de água na rua para os animais, cadastrados por quem cuida
-- ou por quem conhece. A equipe confere antes de aparecer no mapa (perfil verificado entra
-- direto) e quem passa conta se abasteceu, se está vazio ou se o ponto sumiu.
-- Tudo novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS feed_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quem cadastrou e pode editar ou apagar.
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('food', 'water', 'both')),
  -- 'mine': quem cadastrou cuida do ponto e recebe aviso quando alguém diz que está vazio.
  relation text NOT NULL CHECK (relation IN ('mine', 'known')),
  address_text text NOT NULL CHECK (char_length(address_text) BETWEEN 3 AND 160),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  -- Pote na calçada é lugar público: o ponto aparece exato para quem quer achar.
  location geography(Point, 4326) NOT NULL,
  photo_key text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 300),
  reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  -- O último aviso de quem passou, para o mapa dizer se está abastecido.
  last_refilled_at timestamptz,
  last_empty_at timestamptz,
  last_checked_at timestamptz,
  -- Último aviso de "está vazio" mandado a quem cuida, para não mandar um a cada toque.
  owner_warned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_points_location_idx ON feed_points USING gist (location)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS feed_points_user_idx ON feed_points (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feed_points_review_idx ON feed_points (status, updated_at);

-- Quem disse o quê sobre o ponto. Uma linha por pessoa e tipo de aviso: repetir só atualiza a
-- hora, e três pessoas diferentes dizendo "não existe mais" tiram o ponto do mapa.
CREATE TABLE IF NOT EXISTS feed_point_reports (
  feed_point_id uuid NOT NULL REFERENCES feed_points (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  report text NOT NULL CHECK (report IN ('refilled', 'empty', 'checked', 'gone')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_point_id, user_id, report)
);
