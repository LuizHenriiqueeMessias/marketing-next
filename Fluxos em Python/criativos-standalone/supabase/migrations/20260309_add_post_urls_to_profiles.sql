ALTER TABLE inspiration_profiles ADD COLUMN IF NOT EXISTS post_urls text[] DEFAULT NULL;
