-- Campanhas: aprovação da equipe, banner com foto e cor, e justificativa sem mínimo de letras.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
--
-- Toda campanha aberta pelo app (ONG, protetor ou outra pessoa) espera a equipe aprovar no
-- painel antes de aparecer e mostrar o Pix. As que já existem continuam no ar ('published').

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'published'
    CHECK (review_status IN ('pending', 'published', 'rejected')),
  ADD COLUMN IF NOT EXISTS review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  -- Foto do banner de destaques (chave do envio no MinIO) e a cor da capa quando não há foto.
  ADD COLUMN IF NOT EXISTS banner_key text,
  ADD COLUMN IF NOT EXISTS banner_color text
    CHECK (banner_color IS NULL OR banner_color IN ('coral', 'turquoise', 'caramel', 'green', 'blue'));

CREATE INDEX IF NOT EXISTS campaigns_review_idx ON campaigns (review_status, created_at)
  WHERE review_status = 'pending';

-- A justificativa não tem mais mínimo de 30 letras (pedido do Hiago em 12/11/2026).
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_purpose_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_purpose_check
  CHECK (char_length(purpose) BETWEEN 1 AND 2000);
