-- Bugs que as pessoas avisam pelo botão do besourinho no app (o app está em pleno
-- desenvolvimento). A equipe lê no painel e marca como resolvido.
-- Tudo novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quem avisou. Excluir a conta apaga os avisos dela (personalTables em accounts.ts).
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  -- Tela em que a pessoa estava quando tocou no besourinho (rota do app).
  screen text CHECK (screen IS NULL OR char_length(screen) <= 200),
  app_version text CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  platform text CHECK (platform IS NULL OR char_length(platform) <= 40),
  device text CHECK (device IS NULL OR char_length(device) <= 120),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_user_idx ON bug_reports (user_id, created_at DESC);
