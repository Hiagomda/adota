DROP TABLE IF EXISTS foster_stays;
ALTER TABLE volunteer_profiles DROP COLUMN IF EXISTS updated_at;
ALTER TABLE volunteer_profiles DROP COLUMN IF EXISTS foster_notes;
ALTER TABLE volunteer_profiles DROP COLUMN IF EXISTS foster_offers;
ALTER TABLE volunteer_profiles DROP COLUMN IF EXISTS foster_special_needs;
ALTER TABLE volunteer_profiles DROP COLUMN IF EXISTS foster_sizes;
ALTER TABLE volunteer_profiles DROP COLUMN IF EXISTS foster_capacity;
