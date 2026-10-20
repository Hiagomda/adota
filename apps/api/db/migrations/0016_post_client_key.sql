-- migrate:no-transaction
-- Chave que o celular manda com cada resgate novo. Se o envio cair depois de o servidor salvar,
-- a fila offline manda de novo com a mesma chave e recebe o mesmo resgate em vez de um segundo.
-- Coluna nova e opcional: APKs antigos continuam publicando sem ela.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS client_key text;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS posts_author_client_key_idx
  ON posts (author_id, client_key) WHERE client_key IS NOT NULL;
