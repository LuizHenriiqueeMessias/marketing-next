# Phase 1: Database Foundation - Research

**Researched:** 2026-03-26
**Domain:** Supabase PostgreSQL schema design, RLS policies, Supabase Storage bucket setup, SQL migration patterns
**Confidence:** HIGH — based on direct codebase inspection of all existing migrations and prior architecture/pitfalls research

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Mídias (thumbnails e vídeos) devem ser baixadas no momento da coleta e armazenadas no Supabase Storage (bucket dedicado). URLs do CDN do Facebook expiram em ~24h e não devem ser referência primária.
- **D-02:** Armazenar o path do Storage na tabela ad_creatives (ex: `storage_image_path`, `storage_video_path`) além das URLs originais do Apify.
- **D-03:** Tabela ad_competitors com campos completos: nome, page_id, page_url, grupo (marca/segmento), notas, is_active, avatar_url, created_at. Suporta agrupamento (UI-04) desde o início do schema.
- **D-04:** Campo `grupo` é text nullable — permite agrupamento opcional sem forçar categorização.
- **D-05:** Resultados da análise IA em tabela separada `ad_analyses` com colunas tipadas (hook_text, hook_type, angle_tag, cta_analysis, structure_summary, score, insights, needs_reanalysis, prompt_version). Não usar JSONB para os campos de análise.
- **D-06:** Relação 1:1 entre ad_creatives e ad_analyses via foreign key. Permite filtro por score direto no SQL/Supabase sem parsear JSON no frontend.

### Claude's Discretion

- Nomes exatos de colunas da tabela ad_creatives (baseado no output do Apify)
- Indexes específicos para performance
- Política de RLS exata (seguir padrão existente: authenticated users full access)
- Estrutura do bucket no Supabase Storage (naming convention)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INF-01 | Tabelas Supabase criadas com RLS habilitado (ad_competitors, ad_creatives, ad_analyses) | Migration pattern confirmed from 00_full_schema.sql + 20260305_readapted_posts.sql; RLS policy structure documented below |
| INF-02 | Sistema armazena dados brutos do Apify em coluna JSONB (safety net para schema incerto) | Column `raw_apify_data jsonb` defined in ARCHITECTURE.md; Apify output schema is MEDIUM confidence — JSONB absorbs uncertainty |
| INF-03 | Sistema baixa mídias (imagens/vídeos) no momento da coleta (URLs expiram em horas) | Storage bucket pattern described; `storage_image_path` and `storage_video_path` columns locked by D-02; bucket must exist before Phase 2 downloads |
| INF-04 | Sistema verifica tamanho do vídeo antes de transcrição (limite 25MB do Groq) | NOTE: INF-04 is mapped to Phase 2 in REQUIREMENTS.md traceability table — Phase 1 only needs to ensure `file_size_bytes` column exists in ad_creatives so Phase 2 can write to it |
</phase_requirements>

---

## Summary

Phase 1 creates the complete Supabase database schema that every downstream phase depends on. This is a pure SQL migration phase — no backend code, no frontend code. The output is one migration file that creates five tables (`ad_competitors`, `ad_creatives`, `ad_analyses`, `ad_collection_runs`, and the Supabase Storage bucket declaration) with RLS policies, indexes, and the full column set locked by user decisions.

The project has a well-established migration pattern across seven existing files. The new migration must follow the exact same conventions: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ENABLE ROW LEVEL SECURITY` immediately after each table, four authenticated policies (SELECT/INSERT/UPDATE/DELETE) plus a `service_role` full access policy, and `CREATE INDEX IF NOT EXISTS` for foreign key columns. The `20260305_readapted_posts.sql` file is the most complete reference — it uses the same idempotent `DO $$ BEGIN ... END $$` guards that are appropriate for this migration as well.

One new pattern in this phase has no prior implementation in the project: the Supabase Storage bucket. Storage buckets cannot be created via SQL alone; they require either the Supabase Dashboard, the `supabase-js` admin API, or a `storage.buckets` INSERT via the management API. The bucket creation step must be treated separately from the SQL migration and documented explicitly so it is not accidentally skipped. The RLS policy for storage objects also follows a different pattern from table RLS — it uses `storage.objects` policies with `bucket_id` as the filter.

**Primary recommendation:** Write a single migration file `20260326_ad_intelligence.sql` for all five tables, then handle storage bucket creation as an explicit separate step (Supabase Dashboard or management API call). Never treat the bucket as implicit.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase PostgreSQL | — (managed) | All tables, RLS, indexes | Already in use; no new DB engine |
| Supabase Storage | — (managed) | Persistent media files | Locked by D-01; integrated with same Supabase project, no extra credentials |

### Supporting

No new libraries required for this phase. All migration work is pure SQL executed against the existing Supabase instance.

**No installation step needed for Phase 1.**

---

## Architecture Patterns

### Recommended Migration File Location

```
Fluxos em Python/criativos-standalone/supabase/migrations/
└── 20260326_ad_intelligence.sql   ← new file this phase creates
```

### Recommended Table Build Order Inside Migration

Build order inside the single migration file must respect foreign key dependencies:

```
1. ad_competitors          (no FK deps — standalone)
2. ad_collection_runs      (FK → ad_competitors)
3. ad_creatives            (FK → ad_competitors, FK → ad_collection_runs)
4. ad_analyses             (FK → ad_creatives)
```

The Supabase Storage bucket (`ad-media`) is created separately, outside this SQL file.

### Pattern 1: Table + RLS (Canonical from 00_full_schema.sql)

Every table in the project follows this exact four-part structure. Do not deviate.

```sql
-- Source: Fluxos em Python/criativos-standalone/supabase/migrations/00_full_schema.sql
CREATE TABLE IF NOT EXISTS table_name (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... columns ...
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read"   ON table_name FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON table_name FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON table_name FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON table_name FOR DELETE TO authenticated USING (true);

-- Service role bypass for backend (FastAPI uses service_role key)
CREATE POLICY "Allow service_role full access" ON table_name FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### Pattern 2: Idempotent Column Guard (from 20260305_readapted_posts.sql)

For any column additions inside the same migration file, use idempotent guards:

```sql
-- Source: Fluxos em Python/criativos-standalone/supabase/migrations/20260305_readapted_posts.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_creatives' AND column_name = 'storage_video_path'
  ) THEN
    ALTER TABLE ad_creatives ADD COLUMN storage_video_path text;
  END IF;
END $$;
```

### Pattern 3: Unique Partial Index (for ad deduplication)

The dedup key for ads is `ad_id` (Facebook's `adArchiveId`). Use a partial unique index so NULL values do not conflict with each other:

```sql
-- Source: ARCHITECTURE.md — UNIQUE constraint on nullable dedup key
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_creatives_ad_id
  ON ad_creatives(ad_id) WHERE ad_id IS NOT NULL;
```

### Pattern 4: Supabase Storage Bucket (NEW pattern — no prior example in project)

Storage buckets cannot be created by SQL. The bucket must be created before Phase 2 attempts any upload. Two options:

**Option A — Supabase Dashboard (simplest):**
1. Open Supabase Dashboard → Storage → New bucket
2. Name: `ad-media`
3. Public: NO (private, authenticated only)
4. File size limit: 100MB (covers video files)

**Option B — Management API (scriptable):**
```bash
# Source: Supabase Storage API docs
curl -X POST "https://{project_ref}.supabase.co/storage/v1/bucket" \
  -H "apikey: {SERVICE_KEY}" \
  -H "Authorization: Bearer {SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"id": "ad-media", "name": "ad-media", "public": false}'
```

**Storage RLS policies** (must be added after bucket exists):
```sql
-- Allow authenticated users to upload to ad-media bucket
CREATE POLICY "Authenticated users can upload ad media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ad-media');

-- Allow authenticated users to read from ad-media bucket
CREATE POLICY "Authenticated users can read ad media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ad-media');

-- Allow service_role full access to ad-media
CREATE POLICY "Service role full access to ad media"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'ad-media') WITH CHECK (bucket_id = 'ad-media');
```

### Recommended Storage Path Convention

```
ad-media/
└── {competitor_id}/
    └── {ad_id}/
        ├── thumbnail.jpg
        ├── video.mp4
        └── image_0.jpg
        └── image_1.jpg
```

This allows efficient lifecycle management per competitor and unambiguous path reconstruction from just `competitor_id` + `ad_id`. The `storage_image_path` and `storage_video_path` columns in `ad_creatives` store these paths (not full URLs).

### Anti-Patterns to Avoid

- **Missing `service_role` policy:** Backend uses `SUPABASE_SERVICE_KEY` to bypass RLS. Without the `service_role` policy, backend inserts fail silently depending on key configuration. Always include it.
- **RLS enabled but no policies:** Enables RLS and then creates no policy = every query returns empty set. Always add the four authenticated policies in the same migration block.
- **Creating bucket via SQL:** `INSERT INTO storage.buckets` is not supported in all Supabase versions; use the Dashboard or management API instead.
- **Storing CDN URLs as primary media reference:** Facebook CDN URLs expire in hours. `thumbnail_url` and `video_url` in ad_creatives hold original Apify URLs only for Phase 2 download use. `storage_image_path` and `storage_video_path` are the permanent references.
- **Skipping `ad_collection_runs` table:** Without run tracking, Phase 2 background task failures are invisible. This table is mandatory before any webhook handler is built.

---

## Full Schema: Recommended Column Definitions

### Table: ad_competitors

Locked by D-03 and D-04. All fields required.

```sql
CREATE TABLE IF NOT EXISTS ad_competitors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  page_id     text,                        -- Facebook Page ID (for Apify actor input)
  page_url    text,                        -- Facebook Page URL (for Apify actor input)
  grupo       text,                        -- D-04: nullable, for grouping (UI-04)
  notas       text,                        -- free-text internal notes
  is_active   boolean     NOT NULL DEFAULT true,
  avatar_url  text,                        -- stored path or URL for competitor logo
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### Table: ad_collection_runs

Run tracking table — required before Phase 2. Enables visibility into webhook processing status.

```sql
CREATE TABLE IF NOT EXISTS ad_collection_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   uuid        NOT NULL REFERENCES ad_competitors(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'running',
                              -- 'running' | 'completed' | 'failed' | 'empty'
  apify_run_id    text,                    -- Apify run ID for debugging
  dataset_id      text,                    -- Apify defaultDatasetId
  ads_found       integer     NOT NULL DEFAULT 0,
  ads_processed   integer     NOT NULL DEFAULT 0,
  error_message   text,                    -- populated on failure
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz              -- NULL until run finishes
);
```

### Table: ad_creatives

Column names chosen by Claude's discretion, informed by ARCHITECTURE.md research and the locked D-02 storage path requirement. `raw_apify_data jsonb` addresses INF-02.

```sql
CREATE TABLE IF NOT EXISTS ad_creatives (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id       uuid        NOT NULL REFERENCES ad_competitors(id) ON DELETE CASCADE,
  collection_run_id   uuid        REFERENCES ad_collection_runs(id) ON DELETE SET NULL,
  ad_id               text,                    -- Facebook adArchiveId (dedup key)
  ad_url              text,                    -- link to the ad in Ad Library
  creative_type       text,                    -- 'video' | 'image' | 'carousel'
  -- Original Apify URLs (expiring — for Phase 2 download only)
  thumbnail_url       text,
  video_url           text,
  image_urls          text[],
  body_text           text,                    -- ad copy / caption
  cta_type            text,                    -- LEARN_MORE, SHOP_NOW, etc.
  start_date          date,
  end_date            date,
  status              text,                    -- ACTIVE | INACTIVE
  platforms           text[],                  -- ["facebook", "instagram"]
  -- Storage paths (permanent — D-02)
  storage_image_path  text,                    -- path inside ad-media bucket
  storage_video_path  text,                    -- path inside ad-media bucket
  -- Processing fields
  transcricao         text,                    -- Groq Whisper output (Phase 2)
  file_size_bytes     bigint,                  -- video file size for INF-04 check
  -- Safety net for schema uncertainty (INF-02)
  raw_apify_data      jsonb,
  collected_at        timestamptz NOT NULL DEFAULT now()
);
```

### Table: ad_analyses

Locked by D-05 (typed columns, no JSONB for analysis fields) and D-06 (1:1 FK to ad_creatives).

```sql
CREATE TABLE IF NOT EXISTS ad_analyses (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id      uuid        NOT NULL UNIQUE REFERENCES ad_creatives(id) ON DELETE CASCADE,
  hook_text        text,                    -- D-05: identified hook line
  hook_type        text,                    -- D-05: e.g. 'question', 'bold_claim', 'story'
  angle_tag        text,                    -- D-05: persuasion angle tag
  cta_analysis     text,                    -- D-05: CTA effectiveness notes
  structure_summary text,                   -- D-05: content structure notes
  score            numeric,                 -- D-05: overall quality score (1-10)
  insights         text,                    -- D-05: free-text Claude insights
  needs_reanalysis boolean     NOT NULL DEFAULT false,  -- D-05: flag for retry
  prompt_version   text        NOT NULL DEFAULT 'v1',   -- D-05: schema version tracking
  full_analysis    jsonb,                   -- raw Claude JSON for extensibility/debugging
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

### Indexes

```sql
-- ad_creatives: dedup on nullable ad_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_creatives_ad_id
  ON ad_creatives(ad_id) WHERE ad_id IS NOT NULL;

-- ad_creatives: FK filter (most common query path)
CREATE INDEX IF NOT EXISTS idx_ad_creatives_competitor_id
  ON ad_creatives(competitor_id);

-- ad_creatives: run join
CREATE INDEX IF NOT EXISTS idx_ad_creatives_collection_run_id
  ON ad_creatives(collection_run_id);

-- ad_analyses: FK filter
CREATE INDEX IF NOT EXISTS idx_ad_analyses_creative_id
  ON ad_analyses(creative_id);

-- ad_collection_runs: competitor filter + status filter
CREATE INDEX IF NOT EXISTS idx_ad_collection_runs_competitor_id
  ON ad_collection_runs(competitor_id);

-- ad_creatives: score filter for dashboard (frequent filter in UI-01)
CREATE INDEX IF NOT EXISTS idx_ad_analyses_score
  ON ad_analyses(score);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deduplication of ads on re-collection | Custom SELECT-then-INSERT logic | `?on_conflict=ad_id` in Supabase REST POST (upsert) | Supabase REST supports PostgreSQL upsert via `Prefer: resolution=merge-duplicates` — already used in `utils.py` SUPABASE_HEADERS |
| RLS policy management | Custom middleware | PostgreSQL RLS policies in migration | Already the project standard; backend bypasses with service_role key |
| Media file URL management | Custom URL signing/expiry logic | Supabase Storage `createSignedUrl()` | Storage handles TTL; Phase 3 frontend can call `createSignedUrl` for display |
| Run status tracking | Polling backend logs | `ad_collection_runs` table written by background task | Gives frontend direct Supabase query visibility without log access |

**Key insight:** The Supabase REST `Prefer: return=representation,resolution=merge-duplicates` header (already in `config.py` SUPABASE_HEADERS) handles upsert at the HTTP level. No custom deduplication logic needed in any flow.

---

## Common Pitfalls

### Pitfall 1: RLS Enabled But No Policies = Silent Empty Results

**What goes wrong:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with no policies causes ALL queries to return empty results (not errors). Frontend sees an empty table and silently appears to work.

**Why it happens:** PostgreSQL RLS default-deny means: no policy = no rows visible. Tables created in migration files do not auto-get policies — unlike tables created via the Supabase Dashboard.

**How to avoid:** Always write the four authenticated policies AND the service_role policy in the same migration block immediately after `ENABLE ROW LEVEL SECURITY`. Never split RLS enablement from policy creation across files.

**Warning signs:** New table shows rows in Supabase Dashboard (service role view) but empty in frontend React app.

### Pitfall 2: Storage Bucket Not Created Before Phase 2

**What goes wrong:** Phase 2 backend tries to upload media to a bucket that does not exist. Supabase Storage returns `404 Bucket not found`. The entire collection run fails for the download step.

**Why it happens:** Buckets are not SQL objects — they live in the Supabase storage layer, not PostgreSQL. A SQL migration cannot create them.

**How to avoid:** Create the `ad-media` bucket explicitly as part of Phase 1 execution. Add a verification step: after running the SQL migration, verify the bucket exists by calling `GET /storage/v1/bucket/ad-media` before marking Phase 1 complete.

**Warning signs:** Phase 2 upload calls return 404 or permission errors for storage paths.

### Pitfall 3: Missing service_role Policy Breaks Backend Inserts

**What goes wrong:** Backend uses `SUPABASE_SERVICE_KEY` (or falls back to `SUPABASE_ANON` per `config.py` line 20). If `SUPABASE_SERVICE_KEY` is empty in the environment, the backend uses the anon key and is subject to RLS. Without a policy allowing anon inserts (which we do not want), backend inserts fail.

**Why it happens:** `config.py` has `_auth_key = SUPABASE_SERVICE_KEY or SUPABASE_ANON` — the anon key is the fallback. The service_role policy in the migration provides defense-in-depth: even with service_role key, explicit policies are good practice for auditability.

**How to avoid:** Include `CREATE POLICY "Allow service_role full access"` for all four new tables. Verify `SUPABASE_SERVICE_KEY` is set in the deployment environment before Phase 2.

### Pitfall 4: ad_collection_runs FK Breaks Before Competitors Exist

**What goes wrong:** If `ad_collection_runs` is created before `ad_competitors` in the migration file, the `REFERENCES ad_competitors(id)` FK fails with "table does not exist."

**Why it happens:** PostgreSQL validates FK references at CREATE TABLE time.

**How to avoid:** Order tables in migration exactly: `ad_competitors` → `ad_collection_runs` → `ad_creatives` → `ad_analyses`. Do not reorder.

### Pitfall 5: Partial Index Syntax for Nullable Dedup Key

**What goes wrong:** `CREATE UNIQUE INDEX ON ad_creatives(ad_id)` without the `WHERE ad_id IS NOT NULL` clause causes all NULL ad_ids to conflict with each other on the second insert (PostgreSQL treats each NULL as distinct in unique constraints, but some contexts behave differently).

**How to avoid:** Always use the partial index pattern: `CREATE UNIQUE INDEX ... WHERE ad_id IS NOT NULL`. This is confirmed as the correct approach in the ARCHITECTURE.md prior research.

---

## Code Examples

### Complete Migration File Structure (ordering and idempotency)

```sql
-- Source: Existing migration pattern in 00_full_schema.sql + 20260305_readapted_posts.sql

-- ============================================================
-- AD INTELLIGENCE — Schema Migration
-- 20260326_ad_intelligence.sql
-- ============================================================

-- 1. ad_competitors
CREATE TABLE IF NOT EXISTS ad_competitors ( ... );
ALTER TABLE ad_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read"   ON ad_competitors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert" ON ad_competitors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON ad_competitors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON ad_competitors FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow service_role full access" ON ad_competitors FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. ad_collection_runs (FK → ad_competitors)
CREATE TABLE IF NOT EXISTS ad_collection_runs ( ... );
ALTER TABLE ad_collection_runs ENABLE ROW LEVEL SECURITY;
-- ... same four policies + service_role ...

-- 3. ad_creatives (FK → ad_competitors, FK → ad_collection_runs)
CREATE TABLE IF NOT EXISTS ad_creatives ( ... );
ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;
-- ... same four policies + service_role ...

-- 4. ad_analyses (FK → ad_creatives)
CREATE TABLE IF NOT EXISTS ad_analyses ( ... );
ALTER TABLE ad_analyses ENABLE ROW LEVEL SECURITY;
-- ... same four policies + service_role ...

-- 5. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_creatives_ad_id ON ad_creatives(ad_id) WHERE ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_creatives_competitor_id ON ad_creatives(competitor_id);
-- ... etc ...
```

### Supabase Upsert Pattern (reuses existing config.py header)

```python
# Source: Fluxos em Python/utils.py — supabase_post pattern
# The SUPABASE_HEADERS in config.py already sets:
#   "Prefer": "return=representation,resolution=merge-duplicates"
# This enables upsert via on_conflict parameter:

await supabase_post(
    "ad_creatives?on_conflict=ad_id",
    {
        "competitor_id": competitor_id,
        "ad_id": item.get("adArchiveId"),
        "body_text": item.get("bodyText") or item.get("adText"),
        "raw_apify_data": item,
        # ... other fields
    }
)
```

### Supabase Query with Join (frontend pattern for D-06)

```typescript
// Source: ARCHITECTURE.md — frontend read flow
// The 1:1 FK (D-06) enables single-query join:
const { data } = await supabase
  .from("ad_creatives")
  .select("*, ad_analyses(*)")
  .eq("competitor_id", competitorId)
  .order("collected_at", { ascending: false });
// No JSON parsing needed — ad_analyses fields are typed columns
```

---

## Runtime State Inventory

> This phase is greenfield (new tables only). No existing runtime state is being renamed or migrated.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — new tables only | None |
| Live service config | Supabase Storage bucket `ad-media` does NOT yet exist | Create via Dashboard or management API as part of Phase 1 execution |
| OS-registered state | None | None |
| Secrets/env vars | `SUPABASE_SERVICE_KEY` — must be non-empty in backend .env for service_role bypass | Verify at deployment before Phase 2 |
| Build artifacts | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase PostgreSQL | All tables | Confirmed (project live) | Managed | — |
| Supabase Storage | ad-media bucket (D-01) | Bucket does NOT exist yet | — | Must create in Phase 1 |
| Supabase Dashboard / API | Bucket creation | Accessible via credentials in config.py | — | Management API curl call |

**Missing dependencies with no fallback:**
- `ad-media` Storage bucket must be created before Phase 2 can upload any media. There is no code fallback for a missing bucket.

**Missing dependencies with fallback:**
- None for Phase 1 SQL migration itself.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual SQL verification via Supabase Dashboard + anon key test queries |
| Config file | None — Phase 1 is pure schema; no automated test runner |
| Quick run command | `curl` query against new tables with anon key (see Phase Gate below) |
| Full suite command | Same — all four tables queried with anon key, then with service_role key |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INF-01 | All four tables exist with RLS | smoke | `curl -H "apikey: {ANON}" "https://{ref}.supabase.co/rest/v1/ad_competitors?limit=1"` → returns `[]` (not 401/403) | Run after migration |
| INF-01 | RLS blocks unauthenticated inserts | smoke | `curl -X POST ... ad_competitors` with anon key → expect 401 or policy block | Run after migration |
| INF-02 | raw_apify_data column exists as JSONB | smoke | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ad_creatives' AND column_name='raw_apify_data'` | Run after migration |
| INF-03 | storage_image_path / storage_video_path columns exist | smoke | `SELECT column_name FROM information_schema.columns WHERE table_name='ad_creatives' AND column_name IN ('storage_image_path','storage_video_path')` | Run after migration |
| INF-03 | ad-media bucket exists | smoke | `curl -H "apikey: {SERVICE}" "https://{ref}.supabase.co/storage/v1/bucket/ad-media"` → 200 | Run after bucket creation |

### Sampling Rate

- **Per task commit:** Verify table exists in Supabase Dashboard
- **Per wave merge:** Run all five smoke queries above
- **Phase gate:** All five smoke queries return expected results; `ad-media` bucket confirmed present before merging to main

### Wave 0 Gaps

- [ ] No test files needed — Phase 1 is SQL-only; verification is direct Supabase API queries documented above

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store analysis as JSONB blob on main table (inspiration_posts pattern) | Separate typed ad_analyses table (D-05) | Decided in Phase 1 design | No JSON parsing in frontend; direct SQL filter on score column |
| Store raw CDN URLs as media references | Download to Supabase Storage + store path (D-01, D-02) | Decided in Phase 1 design | Media persists after Apify CDN URLs expire |
| No run tracking | ad_collection_runs table | Decided in Phase 1 design | Background task failures become visible in the dashboard |

---

## Open Questions

1. **Supabase Storage public vs. private bucket**
   - What we know: D-01 says bucket is dedicated; no decision on public vs private
   - What's unclear: Private bucket requires signed URLs for frontend display; public bucket is simpler but exposes all media to anyone with the URL
   - Recommendation: Use PRIVATE bucket (consistent with auth model, competitor intelligence is sensitive). Frontend generates signed URLs via `supabase.storage.from('ad-media').createSignedUrl(path, 3600)` for display. This is a 1-line call per image/video render.

2. **ad_collection_runs FK cardinality with collection_run_id in ad_creatives**
   - What we know: `collection_run_id uuid REFERENCES ad_collection_runs(id) ON DELETE SET NULL` is proposed
   - What's unclear: Whether a creative should ever move between runs (re-collection updates the same row via upsert on ad_id)
   - Recommendation: Use ON DELETE SET NULL so that run records can be cleaned up without losing ad data. The upsert pattern updates ad rows in place — the collection_run_id will be updated to the latest run on re-collection, which is correct behavior.

3. **`ad_competitors.avatar_url` — path or full URL?**
   - What we know: D-03 includes `avatar_url` field; existing `inspiration_profiles.avatar_url` stores base64 (per 20260324 migration comment)
   - What's unclear: Should competitor logos follow the same base64 pattern or use Storage paths?
   - Recommendation: Use `text` column (same as inspiration_profiles). If Supabase Storage is used for logos, store the path; if base64 on ingest, store base64. The column is unconstrained `text` — both work without schema change.

---

## Sources

### Primary (HIGH confidence)

- Direct inspection: `Fluxos em Python/criativos-standalone/supabase/migrations/00_full_schema.sql` — canonical RLS pattern, all four policy types + service_role
- Direct inspection: `Fluxos em Python/criativos-standalone/supabase/migrations/20260305_readapted_posts.sql` — idempotent migration pattern with DO $$ guards, index syntax, CREATE POLICY IF NOT EXISTS
- Direct inspection: `Fluxos em Python/config.py` — SUPABASE_HEADERS with `Prefer: resolution=merge-duplicates` confirming upsert approach
- Direct inspection: `Fluxos em Python/utils.py` — `supabase_post` function confirming REST upsert pattern
- `.planning/research/ARCHITECTURE.md` — schema design, table relationships, column names (HIGH confidence, from codebase review)
- `.planning/research/PITFALLS.md` — RLS default-off trap, storage URL expiry, run tracking rationale (HIGH confidence)

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — Apify output field names (MEDIUM — needs first-run validation)
- `.planning/phases/01-database-foundation/01-CONTEXT.md` — locked user decisions D-01 through D-06

### Tertiary (LOW confidence)

- None for this phase — all critical decisions verified from codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all patterns from existing migrations
- Architecture: HIGH — all table designs derived from locked decisions + prior architecture research
- Pitfalls: HIGH — RLS and storage pitfalls confirmed from PITFALLS.md research + direct code inspection
- Apify field names in ad_creatives: MEDIUM — column names are Claude's discretion; raw_apify_data JSONB absorbs uncertainty

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable domain — Supabase migration patterns do not change frequently)
