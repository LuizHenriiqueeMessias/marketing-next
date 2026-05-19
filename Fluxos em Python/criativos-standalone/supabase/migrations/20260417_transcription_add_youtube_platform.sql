-- Add 'youtube' to platform CHECK constraint on transcription tables
ALTER TABLE transcription_batches DROP CONSTRAINT IF EXISTS transcription_batches_platform_check;
ALTER TABLE transcription_batches ADD CONSTRAINT transcription_batches_platform_check CHECK (platform IN ('instagram', 'tiktok', 'youtube'));

ALTER TABLE transcription_items DROP CONSTRAINT IF EXISTS transcription_items_platform_check;
ALTER TABLE transcription_items ADD CONSTRAINT transcription_items_platform_check CHECK (platform IN ('instagram', 'tiktok', 'youtube'));
