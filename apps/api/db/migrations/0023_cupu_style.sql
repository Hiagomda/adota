-- Como cada pessoa deixou o Cupu: pose, cenário e enfeite. Tudo novo e opcional: APKs antigos
-- não leem esta tabela. Os códigos são conferidos no servidor (catálogo em @patinha/shared), sem
-- CHECK aqui, para o catálogo crescer sem migração.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS cupu_styles (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  pose text NOT NULL DEFAULT 'sit' CHECK (char_length(pose) <= 40),
  scene text NOT NULL DEFAULT 'creme' CHECK (char_length(scene) <= 40),
  accessory text NOT NULL DEFAULT 'none' CHECK (char_length(accessory) <= 40),
  updated_at timestamptz NOT NULL DEFAULT now()
);
