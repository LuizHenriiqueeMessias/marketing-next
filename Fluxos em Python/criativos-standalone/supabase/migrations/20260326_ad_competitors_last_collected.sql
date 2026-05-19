-- ============================================================
-- AD COMPETITORS — Add last_collected_at column
-- 20260326_ad_competitors_last_collected.sql
--
-- Adds: last_collected_at timestamptz to ad_competitors
-- Purpose: Scheduler reads this to skip competitors collected
--          less than 6 days ago (D-02, D-06).
-- Depends: 20260326_ad_intelligence.sql (ad_competitors table)
-- ============================================================

ALTER TABLE ad_competitors ADD COLUMN IF NOT EXISTS last_collected_at timestamptz;
