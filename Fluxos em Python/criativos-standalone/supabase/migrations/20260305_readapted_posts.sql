-- Create readapted_posts table (if not exists)
-- Stores posts that were readapted from inspiration_posts

CREATE TABLE IF NOT EXISTS readapted_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspiration_post_id uuid NOT NULL UNIQUE REFERENCES inspiration_posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES inspiration_profiles(id) ON DELETE CASCADE,
  client_name text NOT NULL DEFAULT '',
  original_caption text,
  original_post_url text,
  original_thumbnail_url text,
  media_type text,
  tema text,
  gancho text,
  sugestao_readaptacao text,
  score_relevancia numeric,
  status text NOT NULL DEFAULT 'pendente',
  curtidas integer NOT NULL DEFAULT 0,
  envios integer NOT NULL DEFAULT 0,
  visualizacoes integer NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns that might be missing on existing tables
DO $$
BEGIN
  -- observacoes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'readapted_posts' AND column_name = 'observacoes'
  ) THEN
    ALTER TABLE readapted_posts ADD COLUMN observacoes text;
  END IF;

  -- original_thumbnail_url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'readapted_posts' AND column_name = 'original_thumbnail_url'
  ) THEN
    ALTER TABLE readapted_posts ADD COLUMN original_thumbnail_url text;
  END IF;

  -- envios column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'readapted_posts' AND column_name = 'envios'
  ) THEN
    ALTER TABLE readapted_posts ADD COLUMN envios integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Backfill: set envios = 0 where null (in case column existed without default)
UPDATE readapted_posts SET envios = 0 WHERE envios IS NULL;

-- Backfill: set client_name = '' where null
UPDATE readapted_posts SET client_name = '' WHERE client_name IS NULL;

-- Index for profile_id filtering
CREATE INDEX IF NOT EXISTS idx_readapted_posts_profile_id ON readapted_posts(profile_id);

-- Enable RLS
ALTER TABLE readapted_posts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all readapted_posts
CREATE POLICY IF NOT EXISTS "Allow authenticated read" ON readapted_posts
  FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert
CREATE POLICY IF NOT EXISTS "Allow authenticated insert" ON readapted_posts
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update
CREATE POLICY IF NOT EXISTS "Allow authenticated update" ON readapted_posts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated users to delete
CREATE POLICY IF NOT EXISTS "Allow authenticated delete" ON readapted_posts
  FOR DELETE TO authenticated USING (true);
