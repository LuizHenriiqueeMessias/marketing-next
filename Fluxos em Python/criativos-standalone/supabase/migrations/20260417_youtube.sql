-- ══════════════════════════════════════════════════════════════════════════
-- YouTube module — channels, posts, readapted posts
-- (Estrutura espelhada do modulo TikTok — 20260416_tiktok.sql)
-- ══════════════════════════════════════════════════════════════════════════

-- ── youtube_channels ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS youtube_channels (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  handle          text,
  url             text        NOT NULL,
  channel_id      text,
  avatar          text,
  bio             text,
  subscribers     bigint,
  total_views     bigint,
  video_count     bigint,
  max_videos      integer     NOT NULL DEFAULT 10,
  custom_prompt   text,
  last_scraped_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE youtube_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "youtube_channels_select" ON youtube_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "youtube_channels_insert" ON youtube_channels FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "youtube_channels_update" ON youtube_channels FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "youtube_channels_delete" ON youtube_channels FOR DELETE TO authenticated USING (true);
CREATE POLICY "youtube_channels_service" ON youtube_channels FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── youtube_posts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS youtube_posts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id            uuid        REFERENCES youtube_channels(id) ON DELETE CASCADE,
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  post_url              text,
  video_id              text,
  title                 text,
  description           text,
  media_type            text        DEFAULT 'video',
  thumbnail_url         text,
  views                 bigint      DEFAULT 0,
  likes                 bigint      DEFAULT 0,
  comments              bigint      DEFAULT 0,
  duration              real,
  published_at          timestamptz,
  is_short              boolean     DEFAULT false,
  tags                  jsonb,
  transcricao           text,
  transcricao_formatada text,
  cortes_sugeridos      jsonb,
  analysis              jsonb,
  readapted             boolean     NOT NULL DEFAULT false,
  discarded             boolean     NOT NULL DEFAULT false,
  raw_apify_data        jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE youtube_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "youtube_posts_select" ON youtube_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "youtube_posts_insert" ON youtube_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "youtube_posts_update" ON youtube_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "youtube_posts_delete" ON youtube_posts FOR DELETE TO authenticated USING (true);
CREATE POLICY "youtube_posts_service" ON youtube_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_youtube_posts_channel ON youtube_posts(channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_posts_video_id ON youtube_posts(video_id);


-- ── youtube_readapted_posts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS youtube_readapted_posts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_post_id       uuid        NOT NULL REFERENCES youtube_posts(id) ON DELETE CASCADE,
  channel_id            uuid        REFERENCES youtube_channels(id) ON DELETE SET NULL,
  user_id               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name           text,
  original_title        text,
  original_description  text,
  original_post_url     text,
  original_thumbnail_url text,
  media_type            text,
  tema                  text,
  gancho                text,
  sugestao_readaptacao  text,
  hooks_magneticos      jsonb,
  score_relevancia      real,
  transcricao           text,
  visualizacoes         bigint      DEFAULT 0,
  curtidas              bigint      DEFAULT 0,
  comentarios           bigint      DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE youtube_readapted_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "youtube_readapted_select" ON youtube_readapted_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "youtube_readapted_insert" ON youtube_readapted_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "youtube_readapted_update" ON youtube_readapted_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "youtube_readapted_delete" ON youtube_readapted_posts FOR DELETE TO authenticated USING (true);
CREATE POLICY "youtube_readapted_service" ON youtube_readapted_posts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_youtube_readapted_post ON youtube_readapted_posts(youtube_post_id);
CREATE INDEX IF NOT EXISTS idx_youtube_readapted_channel ON youtube_readapted_posts(channel_id);
