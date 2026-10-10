-- A rescue can be marked not found, and can return to open.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT rel.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname IN ('posts', 'animals')
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%for_adoption%'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', rec.table_name, rec.constraint_name);
  END LOOP;
END $$;

ALTER TABLE posts ADD CONSTRAINT posts_status_check
  CHECK (status IN ('open', 'on_the_way', 'not_found', 'rescued', 'fostered', 'for_adoption', 'adopted'));

ALTER TABLE animals ADD CONSTRAINT animals_status_check
  CHECK (status IN ('open', 'on_the_way', 'not_found', 'rescued', 'fostered', 'for_adoption', 'adopted'));
