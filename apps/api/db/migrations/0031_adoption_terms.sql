-- Termo de adoção responsável. Quem adota aceita no app depois que o animal é marcado como
-- adotado, e o texto fica guardado como foi lido. ONG ou protetor verificado pode escrever o
-- próprio termo no painel (org_adoption_terms); sem isso vale o termo do app.
-- A tabela adoption_terms existe desde a 0001, mas nenhum app gravou nela: as colunas novas
-- entram com valor padrão. APKs antigos não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS org_adoption_terms (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 200 AND 8000),
  require_identity boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE adoption_terms ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';
ALTER TABLE adoption_terms DROP CONSTRAINT IF EXISTS adoption_terms_source_check;
ALTER TABLE adoption_terms
  ADD CONSTRAINT adoption_terms_source_check CHECK (source IN ('app', 'org'));
ALTER TABLE adoption_terms ADD COLUMN IF NOT EXISTS giver_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE adoption_terms ADD COLUMN IF NOT EXISTS giver_name text;
ALTER TABLE adoption_terms ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE adoption_terms ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE adoption_terms ADD COLUMN IF NOT EXISTS address text;
