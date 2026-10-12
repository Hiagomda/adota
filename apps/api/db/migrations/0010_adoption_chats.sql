-- Private adoption chats. One thread per post and interested person.
CREATE TABLE adoption_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  adopter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, adopter_id)
);

CREATE INDEX adoption_threads_post_idx ON adoption_threads (post_id);

CREATE TABLE adoption_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES adoption_threads (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX adoption_messages_thread_created_idx ON adoption_messages (thread_id, created_at DESC);
