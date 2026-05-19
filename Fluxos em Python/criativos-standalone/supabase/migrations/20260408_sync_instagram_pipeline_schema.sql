ALTER TABLE inspiration_profiles
ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz;

ALTER TABLE inspiration_posts
ADD COLUMN IF NOT EXISTS post_id text,
ADD COLUMN IF NOT EXISTS video_url text,
ADD COLUMN IF NOT EXISTS envios integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS transcricao text;

UPDATE inspiration_posts
SET envios = 0
WHERE envios IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspiration_posts_profile_post_id
  ON inspiration_posts(profile_id, post_id)
  WHERE profile_id IS NOT NULL AND post_id IS NOT NULL;
