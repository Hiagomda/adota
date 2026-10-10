-- Rollback refuses to rewrite accounts. Reassign moderator rows yourself, then run this.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE role = 'moderator') THEN
    RAISE EXCEPTION 'moderator rows exist; reassign them before rolling this migration back';
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'protector', 'ngo', 'admin'));
