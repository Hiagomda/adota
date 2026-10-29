-- Campanhas de arrecadação transparentes. Tudo novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
--
-- O app nunca recebe dinheiro. A doação vai pelo Pix do responsável verificado, fora do app, e
-- só conta no progresso o que o responsável confirmou com comprovante. Aviso de quem doou fica
-- pendente e não soma.

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users (id),
  -- O animal (passaporte) e o caso (post) que a campanha ajuda. Os dois são opcionais.
  animal_id uuid REFERENCES animals (id) ON DELETE SET NULL,
  post_id uuid REFERENCES posts (id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 6 AND 80),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 30 AND 2000),
  -- Centavos inteiros: nada de ponto flutuante com dinheiro.
  goal_cents integer NOT NULL CHECK (goal_cents BETWEEN 1000 AND 100000000),
  -- Último dia da campanha no calendário de Belém.
  deadline date NOT NULL,
  pix_key text NOT NULL CHECK (char_length(pix_key) BETWEEN 3 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'suspended')),
  closing_note text CHECK (closing_note IS NULL OR char_length(closing_note) <= 2000),
  closed_at timestamptz,
  suspended_reason text,
  client_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'closed' OR closed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns (status, deadline);
CREATE INDEX IF NOT EXISTS campaigns_owner_idx ON campaigns (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_animal_idx ON campaigns (animal_id) WHERE animal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaigns_post_idx ON campaigns (post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_client_key_idx
  ON campaigns (owner_id, client_key) WHERE client_key IS NOT NULL;

-- Livro-caixa da campanha. Nada é apagado nem editado: correção é anular com motivo.
CREATE TABLE IF NOT EXISTS campaign_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('donation', 'expense')),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000),
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 200),
  occurred_on date NOT NULL,
  -- pending: alguém avisou que doou; só o responsável confirma. Confirmado é o que soma.
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'voided')),
  -- Chave do envio no MinIO (uploads/<conta>/<id>.jpg). Confirmado sempre tem comprovante.
  receipt_key text,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Aviso de doação: mostrar o primeiro nome de quem doou? Padrão é doação anônima.
  show_name boolean NOT NULL DEFAULT false,
  decided_by uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 300),
  client_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'confirmed' OR receipt_key IS NOT NULL),
  -- Despesa é lançada pelo responsável: nasce confirmada e só pode ser anulada.
  CHECK (kind = 'donation' OR status IN ('confirmed', 'voided'))
);

CREATE INDEX IF NOT EXISTS campaign_entries_campaign_idx
  ON campaign_entries (campaign_id, occurred_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_entries_pending_idx
  ON campaign_entries (campaign_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS campaign_entries_creator_idx ON campaign_entries (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_entries_client_key_idx
  ON campaign_entries (created_by, client_key) WHERE client_key IS NOT NULL;

-- Histórico auditável: cada criação, edição, lançamento, decisão, anulação e encerramento.
CREATE TABLE IF NOT EXISTS campaign_events (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- 'owner', 'donor', 'staff' ou 'system': quem agiu, mesmo depois que a conta some.
  actor_kind text NOT NULL CHECK (actor_kind IN ('owner', 'donor', 'staff', 'system')),
  action text NOT NULL,
  entry_id uuid REFERENCES campaign_entries (id) ON DELETE CASCADE,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_events_campaign_idx
  ON campaign_events (campaign_id, created_at DESC, id DESC);

-- O histórico só cresce. A única mudança aceita é o banco soltar a conta apagada (SET NULL).
CREATE OR REPLACE FUNCTION campaign_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_id IS NULL
     AND NEW.campaign_id = OLD.campaign_id
     AND NEW.action = OLD.action
     AND NEW.actor_kind = OLD.actor_kind
     AND NEW.entry_id IS NOT DISTINCT FROM OLD.entry_id
     AND NEW.before IS NOT DISTINCT FROM OLD.before
     AND NEW.after IS NOT DISTINCT FROM OLD.after
     AND NEW.note IS NOT DISTINCT FROM OLD.note
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM campaigns WHERE id = OLD.campaign_id) THEN
    -- A campanha inteira saiu (CASCADE): o histórico vai junto.
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'campaign_events é só de inclusão';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaign_events_append_only ON campaign_events;
CREATE TRIGGER campaign_events_append_only
  BEFORE UPDATE OR DELETE ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION campaign_events_append_only();

-- Denúncia de irregularidade numa campanha entra na mesma fila de denúncias da equipe.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('post', 'comment', 'user', 'campaign'));
