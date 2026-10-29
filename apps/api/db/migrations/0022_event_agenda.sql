-- Agenda de eventos e mutirões. Cresce a partir das feiras de adoção (adoption_events): as
-- feiras que já existem viram eventos da categoria 'adoption_fair', publicados e marcados.
-- Tudo novo é opcional ou tem padrão: APKs antigos continuam lendo /adoption-events igual.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).

ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'adoption_fair'
  CHECK (category IN ('adoption_fair', 'vaccination', 'neutering', 'fundraising', 'community'));
-- Sem número, as inscrições não têm limite.
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS capacity integer
  CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 2000);
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS needs text[] NOT NULL DEFAULT '{}';
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS needs_note text
  CHECK (needs_note IS NULL OR char_length(needs_note) <= 300);
-- Bairro tirado do nome do lugar, para filtrar por região sem expor outro ponto.
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS neighborhood text
  CHECK (neighborhood IS NULL OR char_length(neighborhood) <= 80);
-- Evento de quem não tem selo espera a equipe; feira de ONG verificada já entra publicada.
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'published'
  CHECK (review_status IN ('pending', 'published', 'rejected'));
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS review_note text
  CHECK (review_note IS NULL OR char_length(review_note) <= 300);
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS cancel_reason text
  CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 300);
-- Sobe a cada edição: duas pessoas editando ao mesmo tempo não se atropelam.
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- Resultado contado por quem organizou, depois que o evento começou.
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS result_summary text
  CHECK (result_summary IS NULL OR char_length(result_summary) <= 500);
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS result_adoptions integer
  CHECK (result_adoptions IS NULL OR result_adoptions BETWEEN 0 AND 1000);
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS result_animals_served integer
  CHECK (result_animals_served IS NULL OR result_animals_served BETWEEN 0 AND 10000);
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS result_recorded_at timestamptz;
-- Evita dois eventos iguais quando o celular reenvia o cadastro depois de cair a internet.
ALTER TABLE adoption_events ADD COLUMN IF NOT EXISTS client_key text
  CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 64);

CREATE UNIQUE INDEX IF NOT EXISTS adoption_events_client_key_idx
  ON adoption_events (user_id, client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS adoption_events_agenda_idx ON adoption_events (starts_at, id)
  WHERE hidden = false AND review_status = 'published';
CREATE INDEX IF NOT EXISTS adoption_events_review_idx ON adoption_events (created_at)
  WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS adoption_events_user_idx ON adoption_events (user_id, starts_at DESC);

-- Inscrições. Uma por pessoa e evento; cancelar e voltar reaproveita a linha.
CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES adoption_events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('registered', 'waitlist', 'cancelled')),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  -- Ordem da fila de espera: muda quando a pessoa entra de novo.
  queued_at timestamptz NOT NULL DEFAULT now(),
  -- A pessoa confirmou que vai; quem organiza marca quem apareceu.
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_registrations_event_idx
  ON event_registrations (event_id, status, queued_at);
CREATE INDEX IF NOT EXISTS event_registrations_user_idx
  ON event_registrations (user_id, status);

-- Histórico do evento: criação, mudanças de dia, hora ou lugar, cancelamento, moderação e
-- resultado. Só cresce.
CREATE TABLE IF NOT EXISTS event_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES adoption_events (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (
    kind IN ('created', 'updated', 'cancelled', 'approved', 'rejected', 'hidden', 'unhidden', 'result')
  ),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_changes_event_idx ON event_changes (event_id, created_at DESC);

-- Lembretes já mandados. A chave leva o horário do evento: se ele mudar, o lembrete sai de novo.
CREATE TABLE IF NOT EXISTS event_reminders (
  event_id uuid NOT NULL REFERENCES adoption_events (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('day', 'soon')),
  starts_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, kind, starts_at)
);

-- Denúncia de evento (golpe, venda de animal, evento falso). Uma por pessoa e evento.
CREATE TABLE IF NOT EXISTS event_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES adoption_events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_reports_open_idx ON event_reports (event_id) WHERE status = 'open';
