-- ============================================================
-- BATCH TRANSCRIBER
-- 20260410_transcription_batches.sql
--
-- Creates: transcription_batches, transcription_items
-- ============================================================

CREATE TABLE IF NOT EXISTS transcription_batches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  platform        text        NOT NULL CHECK (platform IN ('instagram')),
  status          text        NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'partial_error')),
  total_items     integer     NOT NULL CHECK (total_items >= 0),
  completed_items integer     NOT NULL DEFAULT 0 CHECK (completed_items >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcription_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            uuid        NOT NULL REFERENCES transcription_batches(id) ON DELETE CASCADE,
  url                 text        NOT NULL,
  platform            text        NOT NULL CHECK (platform IN ('instagram')),
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'error')),
  detected_language   text,
  transcricao_original text,
  roteiro_adaptado    text,
  error_message       text,
  processed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transcription_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own batches" ON transcription_batches
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users see own items" ON transcription_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM transcription_batches
      WHERE transcription_batches.id = transcription_items.batch_id
        AND transcription_batches.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM transcription_batches
      WHERE transcription_batches.id = transcription_items.batch_id
        AND transcription_batches.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow service_role full access on transcription_batches" ON transcription_batches
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service_role full access on transcription_items" ON transcription_items
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_transcription_batches_user_id
  ON transcription_batches(user_id);

CREATE INDEX IF NOT EXISTS idx_transcription_batches_created_at
  ON transcription_batches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcription_items_batch_id
  ON transcription_items(batch_id);

CREATE INDEX IF NOT EXISTS idx_transcription_items_status
  ON transcription_items(status);
