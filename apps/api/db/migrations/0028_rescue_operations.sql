-- Modo de operação do resgate: os passos de quem disse "vou ajudar" (saí, cheguei, encontrei
-- ou não, resumo). Uma linha por pessoa e resgate; refazer um passo só atualiza a hora. Tudo
-- novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS rescue_operations (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  departed_at timestamptz,
  arrived_at timestamptz,
  finished_at timestamptz,
  outcome text CHECK (outcome IS NULL OR outcome IN ('found', 'not_found', 'could_not')),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 500),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS rescue_operations_user_idx ON rescue_operations (user_id, started_at DESC);
