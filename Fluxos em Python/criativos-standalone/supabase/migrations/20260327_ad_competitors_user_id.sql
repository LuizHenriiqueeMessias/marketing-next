-- Add user_id to ad_competitors for per-user isolation
ALTER TABLE ad_competitors
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
