-- Tema do painel da ONG: a cor escolhida e uma frase curta. Tabela nova e opcional: APKs antigos
-- não leem. As cores são conferidas no servidor (lista em @patinha/shared).
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS ngo_panel_settings (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  accent text NOT NULL DEFAULT 'turquoise' CHECK (char_length(accent) <= 20),
  tagline text CHECK (tagline IS NULL OR char_length(tagline) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);
