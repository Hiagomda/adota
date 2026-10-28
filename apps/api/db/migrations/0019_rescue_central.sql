-- Central de resgates: ofertas de ajuda que não são ir até o animal (lar temporário, ração,
-- veterinário, materiais). Tudo novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS rescue_help_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Sem transporte: o app não tem carona nem transporte.
  kind text NOT NULL CHECK (kind IN ('foster', 'food', 'vet', 'supplies', 'other')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users (id) ON DELETE SET NULL
);

-- Uma oferta ativa por pessoa e tipo em cada resgate: tocar duas vezes não duplica.
CREATE UNIQUE INDEX IF NOT EXISTS rescue_help_offers_active_unique
  ON rescue_help_offers (post_id, user_id, kind)
  WHERE status IN ('offered', 'accepted');
CREATE INDEX IF NOT EXISTS rescue_help_offers_post_idx ON rescue_help_offers (post_id, status);
CREATE INDEX IF NOT EXISTS rescue_help_offers_user_idx ON rescue_help_offers (user_id, created_at DESC);

-- Casos da central: resgates principais ainda em andamento.
CREATE INDEX IF NOT EXISTS posts_central_idx ON posts (created_at DESC)
  WHERE type = 'rescue_alert' AND parent_post_id IS NULL AND hidden = false
    AND status IN ('open', 'on_the_way', 'not_found', 'rescued');
-- Última novidade de cada caso (linhas do diário).
CREATE INDEX IF NOT EXISTS posts_parent_created_idx ON posts (parent_post_id, created_at DESC)
  WHERE parent_post_id IS NOT NULL;
