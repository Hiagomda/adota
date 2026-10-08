CREATE TABLE volunteer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  is_transport_available boolean NOT NULL DEFAULT false,
  is_foster_available boolean NOT NULL DEFAULT false,
  foster_pet_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  foster_max_days integer,
  service_radius_km integer NOT NULL DEFAULT 10,
  CONSTRAINT volunteer_profiles_radius_check CHECK (service_radius_km BETWEEN 1 AND 100),
  CONSTRAINT volunteer_profiles_days_check CHECK (
    foster_max_days IS NULL OR foster_max_days BETWEEN 1 AND 365
  )
);

CREATE TABLE user_xp_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (
    action_type IN ('report', 'transport', 'foster', 'donation', 'adoption')
  ),
  points integer NOT NULL CHECK (points > 0),
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_xp_history_source_unique UNIQUE (user_id, source_id)
);

CREATE INDEX user_xp_history_user_idx ON user_xp_history (user_id, created_at DESC);

CREATE TABLE user_badges (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_code text NOT NULL CHECK (
    badge_code IN (
      'local_hero',
      'good_pilot',
      'open_doors',
      'top_sponsor',
      'neighborhood_scout'
    )
  ),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_code)
);
