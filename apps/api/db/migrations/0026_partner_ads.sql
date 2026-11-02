-- O anúncio de parceiro passa a ser pago. O pagamento é combinado com a equipe, fora do app (o
-- app não recebe dinheiro), e a equipe marca no painel até quando ele vale. Os anúncios também
-- ficam atrás de uma chave do painel, que começa desligada: com ela desligada a API não devolve
-- parceiros para ninguém, nem para APKs antigos.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES ('partners_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Último dia (no fuso de Belém) em que o anúncio aparece. Sem data, não aparece.
ALTER TABLE partners ADD COLUMN IF NOT EXISTS paid_until date;
