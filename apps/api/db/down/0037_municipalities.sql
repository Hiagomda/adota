DROP TRIGGER IF EXISTS posts_fill_municipality ON posts;
DROP FUNCTION IF EXISTS posts_fill_municipality();
DROP FUNCTION IF EXISTS municipality_at(geography);
DROP INDEX IF EXISTS posts_municipality_idx;
ALTER TABLE posts DROP COLUMN IF EXISTS municipality_code;
DROP TABLE IF EXISTS municipalities;
