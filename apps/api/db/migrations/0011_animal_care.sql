-- What people adopting ask first. Null means nobody said yet, never "no".
ALTER TABLE animals ADD COLUMN IF NOT EXISTS neutered boolean;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS vaccinated boolean;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS good_with_kids boolean;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS good_with_animals boolean;
