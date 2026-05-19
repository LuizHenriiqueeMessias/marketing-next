ALTER TABLE inspiration_profiles
ADD COLUMN IF NOT EXISTS custom_prompt text DEFAULT '';
