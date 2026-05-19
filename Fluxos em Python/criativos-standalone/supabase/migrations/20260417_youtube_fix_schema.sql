-- Fix: add missing columns on youtube_channels if the table pre-existed from
-- the old YouTube module. Uses IF NOT EXISTS so safe to re-run.

ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS avatar         text;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS bio            text;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS subscribers    bigint;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS total_views    bigint;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS video_count    bigint;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS channel_id     text;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS handle         text;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS max_videos     integer NOT NULL DEFAULT 10;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS custom_prompt  text;
ALTER TABLE youtube_channels ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz;

-- Same defensive pass for youtube_posts and youtube_readapted_posts
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS post_url              text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS video_id              text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS title                 text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS description           text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS media_type            text DEFAULT 'video';
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS thumbnail_url         text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS views                 bigint DEFAULT 0;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS likes                 bigint DEFAULT 0;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS comments              bigint DEFAULT 0;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS duration              real;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS published_at          timestamptz;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS is_short              boolean DEFAULT false;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS tags                  jsonb;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS transcricao           text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS transcricao_formatada text;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS cortes_sugeridos      jsonb;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS analysis              jsonb;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS readapted             boolean NOT NULL DEFAULT false;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS discarded             boolean NOT NULL DEFAULT false;
ALTER TABLE youtube_posts ADD COLUMN IF NOT EXISTS raw_apify_data        jsonb;

ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS client_name            text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS original_title         text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS original_description   text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS original_post_url      text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS original_thumbnail_url text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS media_type             text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS tema                   text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS gancho                 text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS sugestao_readaptacao   text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS hooks_magneticos       jsonb;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS score_relevancia       real;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS transcricao            text;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS visualizacoes          bigint DEFAULT 0;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS curtidas               bigint DEFAULT 0;
ALTER TABLE youtube_readapted_posts ADD COLUMN IF NOT EXISTS comentarios            bigint DEFAULT 0;
