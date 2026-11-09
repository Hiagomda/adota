-- Conversa de adoção de volta, agora monitorada: cada mensagem guarda as categorias que o filtro
-- achou, as barradas (venda e Pix) ficam só para a equipe, e a equipe revisa, esconde mensagem e
-- fecha conversa pelo painel.
ALTER TABLE adoption_messages
  ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS withheld boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE adoption_threads
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'clear'
    CHECK (review_status IN ('clear', 'flagged', 'reviewed')),
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

UPDATE adoption_threads t SET last_message_at = (
  SELECT max(created_at) FROM adoption_messages m WHERE m.thread_id = t.id
);

CREATE INDEX IF NOT EXISTS adoption_threads_flagged_idx
  ON adoption_threads (flagged_at DESC) WHERE review_status = 'flagged';
CREATE INDEX IF NOT EXISTS adoption_threads_last_message_idx
  ON adoption_threads (last_message_at DESC);

-- Quando a pessoa leu e aceitou o aviso de monitoramento (transparência da LGPD).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS chat_notice_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_notice_version integer;

-- Denúncia de uma conversa entra na mesma fila de denúncias da equipe.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('post', 'comment', 'user', 'campaign', 'adoption_thread'));
