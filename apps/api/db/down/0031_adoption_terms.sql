ALTER TABLE adoption_terms DROP COLUMN IF EXISTS address;
ALTER TABLE adoption_terms DROP COLUMN IF EXISTS cpf;
ALTER TABLE adoption_terms DROP COLUMN IF EXISTS full_name;
ALTER TABLE adoption_terms DROP COLUMN IF EXISTS giver_name;
ALTER TABLE adoption_terms DROP COLUMN IF EXISTS giver_id;
ALTER TABLE adoption_terms DROP CONSTRAINT IF EXISTS adoption_terms_source_check;
ALTER TABLE adoption_terms DROP COLUMN IF EXISTS source;
DROP TABLE IF EXISTS org_adoption_terms;
