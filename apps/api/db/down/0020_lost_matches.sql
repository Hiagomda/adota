DROP TABLE IF EXISTS lost_matches;
DROP TABLE IF EXISTS post_photo_palettes;
DROP INDEX IF EXISTS posts_lost_open_idx;
ALTER TABLE animals DROP CONSTRAINT IF EXISTS animals_colors_check;
ALTER TABLE animals DROP COLUMN IF EXISTS colors;
