-- Check-ins depois da adoção: aos 7, 30 e 90 dias o tutor conta como está a adaptação. Se
-- estiver difícil ou pedir orientação, quem cuidava do animal recebe o aviso para conversar
-- antes de uma devolução. Tudo novo: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS adoption_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES posts (id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  responsible_id uuid REFERENCES users (id) ON DELETE SET NULL,
  adopted_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adoption_followups_open_idx ON adoption_followups (adopted_at)
  WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS adoption_followups_tutor_idx ON adoption_followups (tutor_id);

CREATE TABLE IF NOT EXISTS adoption_checkins (
  followup_id uuid NOT NULL REFERENCES adoption_followups (id) ON DELETE CASCADE,
  day integer NOT NULL CHECK (day IN (7, 30, 90)),
  notified_at timestamptz,
  answered_at timestamptz,
  mood text CHECK (mood IS NULL OR mood IN ('great', 'ok', 'hard')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  wants_help boolean NOT NULL DEFAULT false,
  PRIMARY KEY (followup_id, day)
);
