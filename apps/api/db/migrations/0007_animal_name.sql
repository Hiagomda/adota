ALTER TABLE animals ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_name_length;
ALTER TABLE animals
  ADD CONSTRAINT animals_name_length CHECK (name IS NULL OR char_length(name) <= 80);
