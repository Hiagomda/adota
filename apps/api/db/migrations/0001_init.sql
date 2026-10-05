CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  name text NOT NULL,
  handle text NOT NULL UNIQUE,
  avatar_url text,
  phone text,
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'protector', 'ngo', 'admin')),
  verified boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
  city text,
  fcm_tokens text[] NOT NULL DEFAULT '{}',
  alert_radius_km integer NOT NULL DEFAULT 10 CHECK (alert_radius_km > 0 AND alert_radius_km <= 100),
  base_location geography(Point, 4326),
  notifications_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start smallint CHECK (quiet_hours_start IS NULL OR quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end smallint CHECK (quiet_hours_end IS NULL OR quiet_hours_end BETWEEN 0 AND 23),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX users_base_location_gix ON users USING GIST (base_location);

CREATE TABLE animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species text NOT NULL CHECK (species IN ('dog', 'cat', 'other')),
  size text NOT NULL CHECK (size IN ('small', 'medium', 'large')),
  age_estimate text,
  sex text CHECK (sex IS NULL OR sex IN ('male', 'female', 'unknown')),
  health_notes text,
  temperament text,
  status text NOT NULL CHECK (
    status IN ('open', 'on_the_way', 'rescued', 'fostered', 'for_adoption', 'adopted')
  ),
  current_owner_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users (id),
  animal_id uuid NOT NULL REFERENCES animals (id),
  type text NOT NULL CHECK (type IN ('rescue_alert', 'update', 'adoption', 'help_request', 'lost')),
  urgency text NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),
  description text NOT NULL,
  location geography(Point, 4326) NOT NULL,
  approx_label text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('open', 'on_the_way', 'rescued', 'fostered', 'for_adoption', 'adopted')
  ),
  parent_post_id uuid REFERENCES posts (id),
  hidden boolean NOT NULL DEFAULT false,
  boosted boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'published' CHECK (review_status IN ('published', 'pending', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_location_gix ON posts USING GIST (location);
CREATE INDEX posts_status_created_at_idx ON posts (status, created_at DESC);
CREATE INDEX posts_author_id_idx ON posts (author_id);

CREATE TABLE post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  url text NOT NULL,
  type text NOT NULL CHECK (type IN ('image')),
  position integer NOT NULL CHECK (position >= 0 AND position < 5),
  UNIQUE (post_id, position)
);

CREATE TABLE responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('will_help', 'seen', 'has_foster', 'can_donate')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, kind)
);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden boolean NOT NULL DEFAULT false
);

CREATE TABLE likes (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE saves (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

CREATE TABLE post_follows (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE story_views (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE fosters (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  capacity integer NOT NULL CHECK (capacity > 0),
  species_accepted text[] NOT NULL,
  sizes_accepted text[] NOT NULL,
  location geography(Point, 4326) NOT NULL,
  radius_km integer NOT NULL CHECK (radius_km > 0),
  available boolean NOT NULL DEFAULT true
);

CREATE INDEX fosters_location_gix ON fosters USING GIST (location);

CREATE TABLE help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES posts (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('food', 'vet', 'castration', 'transport')),
  goal_amount numeric,
  pix_key text,
  deadline timestamptz
);

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users (id),
  target_type text NOT NULL CHECK (target_type IN ('post', 'comment', 'user')),
  target_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'hidden', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE TABLE verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE adoption_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
