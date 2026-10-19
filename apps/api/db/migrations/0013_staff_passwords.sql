-- Login do painel da equipe com usuário e senha (hash scrypt), no lugar do Firebase + TOTP.
CREATE TABLE staff_passwords (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  username text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_passwords_username_format CHECK (username ~ '^[a-z0-9._-]{3,32}$')
);

CREATE UNIQUE INDEX staff_passwords_username_idx ON staff_passwords (username);
