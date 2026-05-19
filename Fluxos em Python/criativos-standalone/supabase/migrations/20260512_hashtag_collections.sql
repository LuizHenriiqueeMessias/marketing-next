-- ══════════════════════════════════════════════════════════════════════════
-- Hashtag collections — agrupa cada scrape do Instagram por hashtag ("pasta")
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS hashtag_collections (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid        NOT NULL REFERENCES inspiration_profiles(id) ON DELETE CASCADE,
  user_id             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  hashtags            text[]      NOT NULL DEFAULT '{}',
  scrape_recent_days  integer,
  posts_per_tag       integer,
  status              text        NOT NULL DEFAULT 'processing',  -- processing | done | error
  posts_count         integer     NOT NULL DEFAULT 0,
  apify_run_id        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hashtag_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hashtag_collections_select"  ON hashtag_collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "hashtag_collections_insert"  ON hashtag_collections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hashtag_collections_update"  ON hashtag_collections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hashtag_collections_delete"  ON hashtag_collections FOR DELETE TO authenticated USING (true);
CREATE POLICY "hashtag_collections_service" ON hashtag_collections FOR ALL    TO service_role  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hashtag_collections_profile ON hashtag_collections(profile_id, created_at DESC);

-- ── colunas novas nos posts existentes (só ADD, não mexe no resto) ──────────
ALTER TABLE inspiration_posts
  ADD COLUMN IF NOT EXISTS hashtag_collection_id uuid REFERENCES hashtag_collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'profile';   -- 'profile' | 'hashtag' | 'specific'

ALTER TABLE readapted_posts
  ADD COLUMN IF NOT EXISTS hashtag_collection_id uuid REFERENCES hashtag_collections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'profile';

CREATE INDEX IF NOT EXISTS idx_inspiration_posts_hashtag_collection ON inspiration_posts(hashtag_collection_id);
CREATE INDEX IF NOT EXISTS idx_readapted_posts_hashtag_collection   ON readapted_posts(hashtag_collection_id);
