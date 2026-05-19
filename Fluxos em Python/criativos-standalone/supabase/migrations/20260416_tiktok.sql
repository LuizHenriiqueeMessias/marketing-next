-- ══════════════════════════════════════════════════════════════════════════
-- TikTok module — profiles, posts, readapted posts
-- ══════════════════════════════════════════════════════════════════════════

-- ── tiktok_profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tiktok_profiles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  handle          text,
  url             text        NOT NULL,
  platform_id     text,
  avatar          text,
  bio             text,
  followers       bigint,
  following       bigint,
  likes_total     bigint,
  video_count     bigint,
  max_videos      integer     NOT NULL DEFAULT 12,
  custom_prompt   text,
  last_scraped_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tiktok_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiktok_profiles_select" ON tiktok_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "tiktok_profiles_insert" ON tiktok_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tiktok_profiles_update" ON tiktok_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tiktok_profiles_delete" ON tiktok_profiles FOR DELETE TO authenticated USING (true);
CREATE POLICY "tiktok_profiles_service" ON tiktok_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── tiktok_posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tiktok_posts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          uuid        REFERENCES tiktok_profiles(id) ON DELETE CASCADE,
  user_id             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  post_url            text,
  video_id            text,
  caption             text,
  media_type          text        DEFAULT 'video',
  thumbnail_url       text,
  likes               bigint      DEFAULT 0,
  comments            bigint      DEFAULT 0,
  shares              bigint      DEFAULT 0,
  views               bigint      DEFAULT 0,
  plays               bigint      DEFAULT 0,
  bookmarks           bigint      DEFAULT 0,
  duration            real,
  music_name          text,
  music_author        text,
  hashtags            jsonb,
  transcricao         text,
  transcricao_formatada text,
  cortes_sugeridos    jsonb,
  analysis            jsonb,
  readapted           boolean     NOT NULL DEFAULT false,
  discarded           boolean     NOT NULL DEFAULT false,
  raw_apify_data      jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tiktok_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiktok_posts_select" ON tiktok_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "tiktok_posts_insert" ON tiktok_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tiktok_posts_update" ON tiktok_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tiktok_posts_delete" ON tiktok_posts FOR DELETE TO authenticated USING (true);
CREATE POLICY "tiktok_posts_service" ON tiktok_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tiktok_posts_profile ON tiktok_posts(profile_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_posts_video_id ON tiktok_posts(video_id);


-- ── tiktok_readapted_posts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tiktok_readapted_posts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_post_id        uuid        NOT NULL REFERENCES tiktok_posts(id) ON DELETE CASCADE,
  profile_id            uuid        REFERENCES tiktok_profiles(id) ON DELETE SET NULL,
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name           text,
  original_caption      text,
  original_post_url     text,
  original_thumbnail_url text,
  media_type            text,
  tema                  text,
  gancho                text,
  sugestao_readaptacao  text,
  hooks_magneticos      jsonb,
  score_relevancia      real,
  transcricao           text,
  curtidas              bigint      DEFAULT 0,
  visualizacoes         bigint      DEFAULT 0,
  envios                bigint      DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tiktok_readapted_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tiktok_readapted_select" ON tiktok_readapted_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "tiktok_readapted_insert" ON tiktok_readapted_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tiktok_readapted_update" ON tiktok_readapted_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tiktok_readapted_delete" ON tiktok_readapted_posts FOR DELETE TO authenticated USING (true);
CREATE POLICY "tiktok_readapted_service" ON tiktok_readapted_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tiktok_readapted_post ON tiktok_readapted_posts(tiktok_post_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_readapted_profile ON tiktok_readapted_posts(profile_id);
