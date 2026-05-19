-- ============================================================
-- CRIATIVOS — Full Database Schema
-- Run this on a fresh Supabase project to set up all tables
-- ============================================================

-- 1. inspiration_profiles
CREATE TABLE IF NOT EXISTS inspiration_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  own_instagram text NOT NULL,
  instagram_handle text NOT NULL,
  max_posts_per_url integer NOT NULL DEFAULT 10,
  post_urls text[] DEFAULT NULL,
  custom_prompt text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inspiration_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON inspiration_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON inspiration_profiles
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON inspiration_profiles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON inspiration_profiles
  FOR DELETE TO authenticated USING (true);

-- 2. inspiration_targets
CREATE TABLE IF NOT EXISTS inspiration_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES inspiration_profiles(id) ON DELETE CASCADE,
  instagram_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inspiration_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON inspiration_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON inspiration_targets
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON inspiration_targets
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON inspiration_targets
  FOR DELETE TO authenticated USING (true);

-- 3. inspiration_posts
CREATE TABLE IF NOT EXISTS inspiration_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES inspiration_profiles(id) ON DELETE CASCADE,
  post_url text,
  thumbnail_url text,
  caption text,
  media_type text,
  analysis jsonb,
  readapted boolean NOT NULL DEFAULT false,
  curtidas integer,
  visualizacoes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspiration_posts_profile_id ON inspiration_posts(profile_id);

ALTER TABLE inspiration_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON inspiration_posts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON inspiration_posts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON inspiration_posts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON inspiration_posts
  FOR DELETE TO authenticated USING (true);

-- 4. readapted_posts
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
  transcricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_readapted_posts_profile_id ON readapted_posts(profile_id);

ALTER TABLE readapted_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON readapted_posts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON readapted_posts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON readapted_posts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON readapted_posts
  FOR DELETE TO authenticated USING (true);

-- Allow service_role full access (for edge functions / callbacks)
CREATE POLICY "Allow service_role full access" ON inspiration_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON inspiration_targets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON inspiration_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON readapted_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
