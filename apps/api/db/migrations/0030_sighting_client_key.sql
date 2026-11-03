-- migrate:no-transaction
-- Avistamento feito sem internet: o celular guarda e manda depois com uma chave própria. Se o
-- envio cair depois de o servidor salvar, mandar de novo com a mesma chave devolve o mesmo
-- avistamento em vez de um segundo. Coluna nova e opcional: APKs antigos continuam sem ela.
ALTER TABLE sightings ADD COLUMN IF NOT EXISTS client_key text;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS sightings_user_client_key_idx
  ON sightings (user_id, client_key) WHERE client_key IS NOT NULL;
