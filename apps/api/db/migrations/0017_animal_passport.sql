-- Passaporte do animal. Tudo novo e opcional: APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).

-- Quando duas ocorrências são o mesmo animal, os posts passam para o animal mais antigo e o
-- outro fica apontando para ele, para links antigos continuarem achando o passaporte.
ALTER TABLE animals ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES animals (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS animals_merged_into_idx ON animals (merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_animal_idx ON posts (animal_id);

-- Vacinas, vermífugos, castração, tratamentos, remédios, exames e consultas.
CREATE TABLE IF NOT EXISTS animal_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animals (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN ('vaccine', 'deworming', 'neutering', 'treatment', 'medication', 'exam', 'vet_visit')
  ),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  occurred_on date NOT NULL,
  next_due_on date CHECK (next_due_on IS NULL OR next_due_on > occurred_on),
  -- Público ou só para quem cuida. Remédio e exame ficam com quem cuida por padrão.
  visibility text NOT NULL DEFAULT 'caretakers' CHECK (visibility IN ('public', 'caretakers')),
  recorded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  client_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Registro tirado continua no banco para auditoria; some do passaporte.
  removed_at timestamptz,
  removed_by uuid REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS animal_health_records_animal_idx
  ON animal_health_records (animal_id, occurred_on DESC) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS animal_health_records_client_key_idx
  ON animal_health_records (recorded_by, client_key) WHERE client_key IS NOT NULL;

-- Com quem o animal esteve: quem resgatou, lares temporários e adoção.
CREATE TABLE IF NOT EXISTS animal_custody (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id uuid NOT NULL REFERENCES animals (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('rescue', 'foster', 'adoption')),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  post_id uuid REFERENCES posts (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS animal_custody_animal_idx ON animal_custody (animal_id, started_at);
CREATE INDEX IF NOT EXISTS animal_custody_open_user_idx
  ON animal_custody (user_id) WHERE ended_at IS NULL;

-- Pedido para juntar duas ocorrências. Quem cuida das duas junta na hora; senão quem cuida da
-- outra confirma. Fica guardado como histórico mesmo depois de decidido.
CREATE TABLE IF NOT EXISTS animal_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_animal_id uuid NOT NULL REFERENCES animals (id) ON DELETE CASCADE,
  to_animal_id uuid NOT NULL REFERENCES animals (id) ON DELETE CASCADE,
  requested_by uuid REFERENCES users (id) ON DELETE SET NULL,
  decided_by uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (from_animal_id <> to_animal_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS animal_links_pending_pair_idx
  ON animal_links (LEAST(from_animal_id, to_animal_id), GREATEST(from_animal_id, to_animal_id))
  WHERE status = 'pending';

-- Quem já adotou pelo app entra no histórico de adoção a partir de agora.
INSERT INTO animal_custody (animal_id, kind, user_id, post_id, started_at)
SELECT a.id, 'adoption', a.current_owner_id,
       (SELECT p.id FROM posts p WHERE p.animal_id = a.id AND p.parent_post_id IS NULL
        ORDER BY p.created_at LIMIT 1),
       COALESCE(
         (SELECT max(p.created_at) FROM posts p
          WHERE p.animal_id = a.id AND p.parent_post_id IS NOT NULL AND p.status = 'adopted'),
         a.created_at
       )
FROM animals a
WHERE a.status = 'adopted'
  AND NOT EXISTS (SELECT 1 FROM animal_custody c WHERE c.animal_id = a.id);
