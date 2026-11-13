-- Chaves liga/desliga de partes do app que a equipe controla pelo painel (tela Ajustes).
-- Começa com o "Anuncie aqui" (convite e atalhos para virar parceiro), desligado.
-- Tudo novo: APKs antigos não leem esta tabela e continuam mostrando o que já mostravam.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS app_switches (
  key text PRIMARY KEY CHECK (key ~ '^[a-z_]{2,40}$'),
  enabled boolean NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_switches (key, enabled) VALUES ('partner_invite', false)
ON CONFLICT (key) DO NOTHING;
