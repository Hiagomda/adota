DROP TABLE IF EXISTS animal_links;
DROP TABLE IF EXISTS animal_custody;
DROP TABLE IF EXISTS animal_health_records;
DROP INDEX IF EXISTS posts_animal_idx;
DROP INDEX IF EXISTS animals_merged_into_idx;
-- Posts movidos para o animal mais antigo continuam nele: desfazer a junção não é automático.
ALTER TABLE animals DROP COLUMN IF EXISTS merged_into_id;
