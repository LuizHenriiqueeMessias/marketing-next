-- Add avatar_url column to store base64 profile picture
ALTER TABLE inspiration_profiles
ADD COLUMN IF NOT EXISTS avatar_url text;
