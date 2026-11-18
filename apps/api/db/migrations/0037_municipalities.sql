-- Municípios atendidos (código IBGE) e o município de cada post.
-- O município sai do ponto do animal (contorno do IBGE no PostGIS), nunca de texto digitado.
-- Os contornos entram na migração seguinte, gerada por scripts/geo/build-municipalities.py.
-- Só acrescenta: nada é apagado nem renomeado. APKs antigos não mandam o município e o
-- gatilho preenche sozinho.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS municipalities (
  code text PRIMARY KEY CHECK (code ~ '^[0-9]{7}$'),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,60}$'),
  name text NOT NULL,
  uf text NOT NULL DEFAULT 'PA' CHECK (uf ~ '^[A-Z]{2}$'),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  seat geography(Point, 4326) NOT NULL,
  area geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS municipalities_area_gix ON municipalities USING GIST (area);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS municipality_code text REFERENCES municipalities (code);

CREATE INDEX IF NOT EXISTS posts_municipality_idx
  ON posts (municipality_code, status, created_at DESC)
  WHERE parent_post_id IS NULL;

-- O município ativo que contém o ponto. Na divisa, o de menor sort_order.
CREATE OR REPLACE FUNCTION municipality_at(point geography) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT m.code FROM municipalities m
  WHERE m.active AND ST_Covers(m.area, point::geometry)
  ORDER BY m.sort_order, m.code
  LIMIT 1
$$;

-- Rede de segurança: todo caminho que grava um post (app novo, APK antigo, painel, diário)
-- sai com município. Quem manda um código (escolha da pessoa já validada pela API) é mantido;
-- se o ponto mudar e o código não, recalcula.
CREATE OR REPLACE FUNCTION posts_fill_municipality() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.location IS DISTINCT FROM OLD.location
     AND NEW.municipality_code IS NOT DISTINCT FROM OLD.municipality_code THEN
    NEW.municipality_code := municipality_at(NEW.location);
  ELSIF NEW.municipality_code IS NULL THEN
    NEW.municipality_code := municipality_at(NEW.location);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS posts_fill_municipality ON posts;
CREATE TRIGGER posts_fill_municipality
  BEFORE INSERT OR UPDATE OF location, municipality_code ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_fill_municipality();
