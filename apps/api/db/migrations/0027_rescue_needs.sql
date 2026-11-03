-- Plano de ação do resgate: a lista de necessidades sai do próprio caso (urgência, saúde, quem
-- está indo, ofertas, Casa Amiga). Aqui ficam só as marcas de quem cuida do caso: resolvido,
-- não precisa ou "precisa" para incluir o que a regra deixou de fora. Tudo novo: APKs antigos
-- não leem nada disto.
-- Antes de aplicar em produção, faça o backup do banco (serviço backup ou docker/backup.sh).
CREATE TABLE IF NOT EXISTS rescue_need_marks (
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('check_site', 'vet', 'foster', 'food', 'supplies')),
  mark text NOT NULL CHECK (mark IN ('needed', 'covered', 'dismissed')),
  marked_by uuid REFERENCES users (id) ON DELETE SET NULL,
  marked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, kind)
);
