-- ============================================================
-- AD INTELLIGENCE — Schema Migration
-- 20260326_ad_intelligence.sql
--
-- Creates: ad_competitors, ad_collection_runs, ad_creatives,
--          ad_analyses + RLS policies + indexes + storage policies
-- Depends: Nothing (first ad intelligence migration)
-- ============================================================


-- ============================================================
-- 1. ad_competitors
-- No FK dependencies — created first
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_competitors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  page_id     text,
  page_url    text,
  grupo       text,
  notas       text,
  is_active   boolean     NOT NULL DEFAULT true,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read"   ON ad_competitors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON ad_competitors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON ad_competitors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON ad_competitors FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow service_role full access" ON ad_competitors FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 2. ad_collection_runs
-- FK -> ad_competitors
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_collection_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   uuid        NOT NULL REFERENCES ad_competitors(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'running',
  apify_run_id    text,
  dataset_id      text,
  ads_found       integer     NOT NULL DEFAULT 0,
  ads_processed   integer     NOT NULL DEFAULT 0,
  error_message   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

ALTER TABLE ad_collection_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read"   ON ad_collection_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON ad_collection_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON ad_collection_runs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON ad_collection_runs FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow service_role full access" ON ad_collection_runs FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 3. ad_creatives
-- FK -> ad_competitors, FK -> ad_collection_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_creatives (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id       uuid        NOT NULL REFERENCES ad_competitors(id) ON DELETE CASCADE,
  collection_run_id   uuid        REFERENCES ad_collection_runs(id) ON DELETE SET NULL,
  ad_id               text,
  ad_url              text,
  creative_type       text,
  thumbnail_url       text,
  video_url           text,
  image_urls          text[],
  body_text           text,
  cta_type            text,
  start_date          date,
  end_date            date,
  status              text,
  platforms           text[],
  storage_image_path  text,
  storage_video_path  text,
  transcricao         text,
  file_size_bytes     bigint,
  raw_apify_data      jsonb,
  collected_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read"   ON ad_creatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON ad_creatives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON ad_creatives FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON ad_creatives FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow service_role full access" ON ad_creatives FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 4. ad_analyses
-- FK -> ad_creatives (1:1 via UNIQUE constraint — D-06)
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_analyses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id      uuid        NOT NULL UNIQUE REFERENCES ad_creatives(id) ON DELETE CASCADE,
  hook_text        text,
  hook_type        text,
  angle_tag        text,
  cta_analysis     text,
  structure_summary text,
  score            numeric,
  insights         text,
  needs_reanalysis boolean     NOT NULL DEFAULT false,
  prompt_version   text        NOT NULL DEFAULT 'v1',
  full_analysis    jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ad_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read"   ON ad_analyses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON ad_analyses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON ad_analyses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON ad_analyses FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow service_role full access" ON ad_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 5. Indexes
-- ============================================================

-- Dedup key: partial unique index so NULL ad_ids do not conflict
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_creatives_ad_id
  ON ad_creatives(ad_id) WHERE ad_id IS NOT NULL;

-- FK filter indexes (most common query paths)
CREATE INDEX IF NOT EXISTS idx_ad_creatives_competitor_id
  ON ad_creatives(competitor_id);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_collection_run_id
  ON ad_creatives(collection_run_id);

CREATE INDEX IF NOT EXISTS idx_ad_analyses_creative_id
  ON ad_analyses(creative_id);

CREATE INDEX IF NOT EXISTS idx_ad_collection_runs_competitor_id
  ON ad_collection_runs(competitor_id);

-- Score filter for dashboard (UI-01 frequent filter)
CREATE INDEX IF NOT EXISTS idx_ad_analyses_score
  ON ad_analyses(score);


-- ============================================================
-- 6. Supabase Storage RLS policies for ad-media bucket
-- NOTE: The ad-media bucket itself must be created via the
-- Supabase Dashboard or management API (cannot be done via SQL).
-- These policies take effect once the bucket exists.
-- ============================================================

CREATE POLICY "Authenticated users can upload ad media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-media');

CREATE POLICY "Authenticated users can read ad media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ad-media');

CREATE POLICY "Service role full access to ad media"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'ad-media') WITH CHECK (bucket_id = 'ad-media');
