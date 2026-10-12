-- Rollback refuses to rewrite accounts that already use the new roles.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE role IN ('support', 'ong_reviewer', 'finance_reviewer', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'staff rows exist; reassign them before rolling this migration back';
  END IF;
END $$;

DROP TABLE IF EXISTS staff_login_attempts;
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
DROP FUNCTION IF EXISTS audit_events_immutable();
DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS staff_recovery_codes;
DROP TABLE IF EXISTS staff_totp;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'protector', 'ngo', 'moderator', 'admin'));
