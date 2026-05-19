# Pitfalls Research

**Domain:** Ad Intelligence Pipeline — Facebook Ad Library scraping, media processing, LLM analysis
**Researched:** 2026-03-26
**Confidence:** HIGH (integration pitfalls from live codebase review) / MEDIUM (external API behaviors from docs + community reports)

---

## Critical Pitfalls

### Pitfall 1: Media URLs From Apify Are Time-Limited Signed URLs

**What goes wrong:**
The Apify Facebook Ads Library Scraper returns `image_url`, `video_url`, and thumbnail fields that are CDN-signed URLs with short TTLs. If you store these URLs in the database and try to display them later — or try to download the media after the run ends — the URLs return 403 or "URL signature expired" errors. The ad may still be active in the Facebook Ad Library but the specific CDN link scraped by Apify is already dead.

**Why it happens:**
Facebook CDN URLs use time-limited signatures to prevent hotlinking and unauthorized media redistribution. Apify captures these URLs at scrape time. By the time a background processing job downloads the video (or a user views the dashboard hours later), the signature has expired. The existing Instagram pipeline (`videos.py`) works because it downloads immediately in the same async flow. The Facebook Ad pipeline will have a gap between scrape completion and media download.

**How to avoid:**
Download and store all media (thumbnails, video files) immediately at collection time — in the same webhook processing task that receives the Apify run completion. Never store raw CDN URLs as the primary reference for media meant to be displayed later. Store media in Supabase Storage or a controlled location, then reference your own URL. For analysis-only use cases, download the video to memory for transcription immediately before Groq Whisper call, do not queue it for later.

**Warning signs:**
- Thumbnails show 403 in the dashboard but the ad is still active
- Video download step randomly fails depending on when the webhook fires
- Intermittent failures that are hard to reproduce (timing-dependent)

**Phase to address:**
Phase 1 (Apify Integration + Data Collection) — must define media persistence strategy before any code is written for the download step.

---

### Pitfall 2: Apify Actor Blocking — Zero Results Without Error

**What goes wrong:**
The Facebook Ads Library Scraper actor can return an empty dataset (0 items) instead of raising a proper error when Facebook blocks the scraping session. The webhook fires normally with a valid `defaultDatasetId`, the backend processes it, finds no items, and silently completes. From the user's perspective, the run "finished" but no ads were collected. This is distinct from an actor failure — the actor succeeds, it just scraped nothing.

**Why it happens:**
Facebook actively blocks automated access to the Ad Library based on proxy fingerprinting, request patterns, and account-level signals. When blocked, the page renders a "Blocked from Searching or Viewing the Ad Library" wall. The actor catches the block at the HTTP level, cannot extract data, and returns an empty result set rather than marking the run as failed. This has been documented in multiple Apify community issues.

**How to avoid:**
Always validate item count after fetching the dataset. If the dataset has 0 items for a run that requested 50+ ads, log it as a collection failure and surface it to the user — do not silently succeed. Add a minimum items threshold check. Consider using a fallback actor if the primary one returns 0 consistently (there are multiple Facebook Ad Library actors on Apify with different proxy strategies). Track per-competitor collection success rates over time to identify systematic blocking.

**Warning signs:**
- Recurrent zero-item datasets for the same competitor
- Works fine for some competitors, always fails for others (likely blocked on those pages)
- Manually opening Facebook Ad Library for the same page shows active ads

**Phase to address:**
Phase 1 (Apify Integration + Data Collection) — build empty dataset detection into the webhook handler before any downstream processing.

---

### Pitfall 3: LLM JSON Parsing Failure Silently Corrupts Data

**What goes wrong:**
The existing `parse_llm_json()` in `utils.py` returns `{"error": "parse_failed", "raw": raw[:500]}` when Claude's output is not valid JSON. This dict gets stored directly into the Supabase `analysis` JSONB column and into derived fields (`tema`, `gancho`, `score_relevancia`). The row is created without error, but all analysis fields are `None` or filled with the raw error dict. For the Ad Intelligence pipeline, this means `hook_type`, `angle`, `cta_type`, `quality_score`, and other structured fields are silently missing — the dashboard shows empty or null values with no indication that analysis failed.

**Why it happens:**
Claude reliably returns JSON for short-to-medium inputs, but fails to close JSON structures when inputs are very long (long ad copy + full video transcription + image description in one message), when the model's output gets cut off at `max_tokens`, or when the prompt allows conversational lead-ins ("Sure, here is the analysis:"). The current max_tokens is 2000, which may be insufficient for ad analysis with multiple structured fields plus rationale fields.

**How to avoid:**
Add a retry with explicit error feedback: if `parse_llm_json` fails, call Claude again with the raw output + "Fix this to be valid JSON, return ONLY the JSON object with no other text." Use Claude's native structured output (tool_use/function calling) which enforces schema compliance. Increase `max_tokens` to at least 4000 for ad analysis. Add a `parse_failed` flag check after `parse_llm_json` — if present, mark the record as `needs_reanalysis` instead of saving corrupt data. Log parse failure rate per prompt version.

**Warning signs:**
- Records with `score_relevancia = None` or `tema = None` in bulk
- `analysis` JSONB contains `"error": "parse_failed"` key
- Inconsistent field presence across records analyzed on the same day

**Phase to address:**
Phase 2 (LLM Analysis Pipeline) — define the analysis schema, set max_tokens, and build the retry/validation layer before the first ad is analyzed.

---

### Pitfall 4: Groq Whisper 25MB File Size Limit Kills Long Ad Videos

**What goes wrong:**
The existing video pipeline in `videos.py` downloads the entire audio file to memory and sends it to Groq. This works for Instagram short videos (under 2 minutes, typically under 5MB). Facebook ad videos can be longer — especially direct response ads, testimonials, or brand awareness videos that run 2-10 minutes. Files above 25MB will be rejected by the Groq API with a 400 error. The current error handling (`_transcribe_groq` raises on `resp.raise_for_status()`) will cause the entire ad processing to fail and log an exception, leaving the ad without transcription.

**Why it happens:**
The existing pipeline was designed for Instagram content where the platform's own compression keeps files small. Facebook ad videos have no such implicit size ceiling. The code path (`_download_audio` → `_transcribe_groq`) holds the full file in memory with no size check before sending.

**How to avoid:**
Add a file size check after download: if `len(audio_bytes) > 24_000_000` (24MB buffer below the 25MB limit), split the audio using `ffmpeg` or `pydub` before transcription, or use Groq's URL-based transcription for files up to 100MB (paid tier). For the MVP, add a hard skip with a `"transcription_skipped": "file_too_large"` marker in the analysis so the ad is still collected and analyzed for visual content. Document the 25MB threshold as a known limitation in the UI.

**Warning signs:**
- Groq API 400 errors in logs with "file too large" message
- Ads from certain competitors never have transcriptions (they consistently produce large files)
- Memory pressure on the backend worker during processing batches

**Phase to address:**
Phase 3 (Media Processing — Video Download + Transcription) — define the file size handling strategy before implementing the transcription step.

---

### Pitfall 5: Adding New Tables Without Proper RLS Breaks Auth Model

**What goes wrong:**
New Supabase tables created via SQL migration (not the Dashboard) have RLS disabled by default. If the new `ad_competitors`, `ad_collections`, `ad_analyses` tables are created without RLS enabled and without policies, every row is publicly readable through the Supabase REST API using only the anon key. The existing app already uses the anon key on the frontend (visible in `config.py`). This means any user who knows the Supabase URL can read all competitor intelligence data without authentication.

**Why it happens:**
Tables created through the Supabase SQL editor or migration files bypass the Dashboard's automatic RLS enablement. It's easy to miss because queries still work without errors — RLS disabled means full access, not blocked access, so nothing breaks during development. The issue only becomes a problem when the data is sensitive.

**How to avoid:**
Always include `ALTER TABLE [table_name] ENABLE ROW LEVEL SECURITY;` immediately after `CREATE TABLE` in every migration file. Pair it with at least one policy in the same migration. Adopt the convention: every migration that creates a table must also create the RLS policy in the same file, never split. For the Ad Intelligence tables, the policy should restrict reads to authenticated users. Test by querying the table with the anon key (not service key) after migration — should return 403 or empty results.

**Warning signs:**
- New table queries work without `Authorization: Bearer [user_token]` header
- Supabase Dashboard shows "RLS disabled" badge on the new tables
- No 403 errors when querying the API unauthenticated

**Phase to address:**
Phase 1 (Database Schema + Migration) — include RLS policy in the migration file itself, verify before merging.

---

### Pitfall 6: FastAPI Background Tasks Silently Fail After Response

**What goes wrong:**
The existing webhook handlers use `BackgroundTasks.add_task()` and return 200 immediately. If the background task raises an uncaught exception, the Apify webhook gets no indication of failure — it received its 200. There is no retry, no notification, and no visibility unless the developer manually checks logs. For the Ad Intelligence pipeline with longer chains (scrape → download → transcribe → analyze × N ads), any step that fails partway through leaves the database in a partially populated state: some ads analyzed, others not, with no clear indication of where processing stopped.

**Why it happens:**
This is the inherent nature of fire-and-forget background tasks. The existing pipeline uses try/except per item (in `videos.py` loop), which handles per-item failures but does not handle failures at the dataset fetch level or systemic failures. The new pipeline will have a more complex graph of operations where intermediate failures are harder to isolate.

**How to avoid:**
Add a job tracking table (`ad_collection_runs`) that records run start, progress, and final status. Update it from within the background task. This gives the dashboard visibility into stuck or failed runs without log access. For systematic failures (dataset fetch fails, all Groq calls fail), catch these at the outer level and write a failed status to the run record. Add a simple webhook retry: if Apify's webhook is misconfigured and fires without `defaultDatasetId`, log and return 422 (not 200) so Apify marks it as failed and can retry.

**Warning signs:**
- A collection run was "triggered" but no ads appear in the database after 30 minutes
- Log shows 200 response but no subsequent processing log entries
- Partial datasets: some ads analyzed, rest missing

**Phase to address:**
Phase 1 (Core Pipeline Infrastructure) — define the run tracking model before the webhook handlers are implemented.

---

### Pitfall 7: Prompt Schema Drift Breaks Dashboard Rendering

**What goes wrong:**
The LLM analysis prompt defines the JSON schema for ad analysis fields (e.g., `hook_type`, `angle`, `cta_type`, `quality_score`, `pain_point_addressed`). If the prompt is modified after data collection begins — adding fields, renaming fields, changing score ranges — old records in the database have the old schema and new records have the new schema. The React dashboard components that read `analysis.hook_type` work for new records but silently return `undefined` for old ones. Over time, the database contains a mix of schema versions with no way to identify which records conform to which version.

**Why it happens:**
Prompt iteration is natural during development and refinement. Without versioning, there is no link between a stored record and the prompt that generated it. The existing Instagram analysis pipeline has this same problem but it is lower stakes because the fields are fewer and less structured.

**How to avoid:**
Store a `prompt_version` field alongside each `analysis` record (e.g., `"v1"`, `"v2"`). Increment it every time the JSON schema changes. Use optional chaining in all React components that render analysis fields (`analysis?.hook_type ?? 'N/A'`). When schema changes are breaking (field renamed or removed), write a one-time migration script that backfills the missing field or marks old records as `needs_reanalysis`. Do not delete old records — mark them with the version and filter in the UI.

**Warning signs:**
- Dashboard shows empty fields for older records but correct data for recent ones
- React console shows `Cannot read property of undefined` for analysis fields
- LLM output contains fields not present in the DB schema or vice versa

**Phase to address:**
Phase 2 (LLM Analysis Pipeline) — define the final analysis JSON schema before writing the first prompt, and add `prompt_version` to the table from day one.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store raw CDN URLs instead of downloading media | Simpler pipeline, no storage cost | Dashboard breaks as URLs expire, no recovery path | Never — download at collection time |
| Single Apify actor for all competitors | Simple config | Single point of failure; one blocked actor = all competitors fail | Only during spike/prototype phase |
| Hardcode `max_tokens=2000` for ad analysis | Quick implementation | JSON truncation for longer ads; silent parse failures | Never — always parameterize per flow |
| Skip `prompt_version` field in early tables | Faster schema | Cannot distinguish schema versions during analysis iteration | Only if prompt is frozen before first data collection |
| Use anon key for backend-to-Supabase calls | Simpler config | RLS bypasses depend on key; if policies exist, anon key fails silently | Never — use service key for backend, anon for frontend |
| Reuse existing `inspiration_posts` table for ad data | No new migration | Mixes Instagram organic + paid ad semantics; filters become complex | Never — competitor ads need their own tables |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Apify webhook | Expecting `resource.defaultDatasetId` to always be present — it is absent on failed runs | Check for `resource.status == "SUCCEEDED"` before reading dataset ID |
| Apify Facebook Ads actor | Running a new actor on the same page while a previous run is still processing | Track in-progress runs per competitor to prevent duplicate collections |
| Groq Whisper | Sending `audio/mpeg` MIME type for `.mp4` files | Detect actual file type from response headers or magic bytes; Groq accepts `audio/mp4` |
| Anthropic API | Using `claude-sonnet-4-20250514` model ID hardcoded — model IDs are versioned and can be deprecated | Store model IDs in `config.py` constants and update in one place; never inline in flow files |
| Supabase REST | Querying new tables with anon key when RLS is enabled but policies are missing — returns empty array, not 403 | Test with anon key explicitly after each migration; empty results are a silent RLS failure |
| Facebook Ad Library (Apify) | Assuming the scraper output schema is stable — fields can appear/disappear between actor versions | Always use `.get()` with defaults for every field; log unknown fields in the raw item |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Processing all ads in one background task loop with sequential LLM calls | Works for 10 ads; takes 20+ minutes for 100 ads; blocks event loop progress | Process in batches; use `asyncio.gather()` with concurrency limits for parallel LLM calls | Beyond ~20 ads per Apify run |
| Downloading full video files to memory before transcribing | Works for 30s Instagram clips; OOM errors for 5-minute Facebook ads | Stream to temp file or size-check before in-memory download | Videos > ~100MB; or multiple concurrent runs |
| No deduplication check before Apify runs | Running scheduled collection for same competitor twice in one day wastes credits and creates duplicate DB rows | Check last collection timestamp per competitor before triggering new run | When scheduling is added in later phases |
| Fetching entire `ad_collections` table for dashboard without pagination | Fast with 50 rows; 5-second query with 5000 rows | Add cursor-based pagination from day one; never `SELECT *` in dashboard queries | Beyond ~500 rows in the table |
| Synchronous Supabase writes per ad item (sequential) | Works for 10 items; 50+ items causes timeout in background task | Batch inserts using Supabase `POST` with array body | Beyond ~30 ads per collection run |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing competitor names or page IDs in public-facing URLs without auth check | Competitor intelligence strategy exposed to anyone who guesses a URL | All Ad Intelligence routes must require authenticated session; use Supabase Auth row check |
| Exposing raw Apify dataset IDs in API responses or frontend state | Anyone can fetch the raw Apify dataset without auth using your APIFY_TOKEN if exposed | Never return dataset IDs to the frontend; resolve them server-side only |
| Keeping API keys as fallback defaults in `config.py` (as existing code does) | Keys visible in source code; if repo is ever made public or leaked, all services are compromised | Use only environment variable lookup with no fallback default; raise at startup if missing |
| Using the same Apify token for both Instagram scraping and Facebook Ad Library scraping | If Facebook scraping triggers an Apify account review, Instagram scraping stops too | Separate Apify tokens per use case where possible; at minimum, use separate Apify tasks |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visibility into collection run status | User triggers a collection, sees nothing for 10 minutes, triggers it again, duplicates data | Show run status badge per competitor: "Collecting...", "Processing...", "Done (47 ads)", "Failed" |
| Displaying raw LLM JSON fields without fallback | Dashboard shows "undefined" or blank cells when analysis partially failed | Always use null coalescing in React; show "Not analyzed" badge for missing fields |
| No date context on ad data | User can't tell if an ad is from yesterday or 6 months ago | Always show collection date and ad first/last seen date prominently |
| Showing expired thumbnail URLs without fallback | Broken image icons throughout the dashboard | Use `onError` fallback on all `<img>` tags; show placeholder; store thumbnails in Supabase Storage |
| No filter by competitor on the main dashboard | User has 10 competitors tracked; all 500 ads shown together | Default view filters to one competitor; global cross-competitor view is secondary |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Apify integration:** Actor runs and webhook fires — verify that empty dataset (0 items) is detected and reported, not silently accepted as success
- [ ] **Media download:** Video downloads successfully — verify with a file > 25MB and a file where the CDN URL has expired (> 6 hours after scrape)
- [ ] **Transcription:** Groq returns text — verify language detection is correct for Portuguese ads; verify behavior with silent/music-only ad videos (high `no_speech_prob`)
- [ ] **LLM analysis:** Claude returns response — verify JSON is valid and all expected fields are present; verify behavior with `max_tokens` exhaustion
- [ ] **Dashboard display:** Cards render — verify with records that have `null` analysis fields; verify with expired thumbnail URLs
- [ ] **Scheduling:** Cron job triggers correctly — verify it does not create duplicate runs if previous run is still processing
- [ ] **RLS on new tables:** Backend can insert rows — verify frontend anon-key queries respect RLS and cannot read competitor data without auth
- [ ] **Existing flows:** New endpoints added to `main.py` — verify existing `/webhook/estaticos`, `/webhook/carrossel`, `/webhook/videos` still respond correctly (no import errors, no route conflicts)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Expired media URLs stored in DB | MEDIUM | Re-trigger Apify collection for affected competitors; download media on new run; update records in place using Supabase `PATCH` |
| Corrupt `analysis` JSON in bulk records | MEDIUM | Write a re-analysis script that fetches records with `analysis ? 'error' = 'parse_failed'` and re-calls Claude for each; use `on_conflict=update` |
| RLS misconfiguration exposes data | HIGH | Immediately enable RLS and add restrictive policy; audit Supabase logs for unauthorized access; rotate affected API keys |
| Broken existing webhooks after adding new code | LOW | Git revert the `main.py` change; re-deploy; test each existing endpoint with a minimal test payload before adding new routes |
| Prompt schema drift — old records missing new fields | LOW | Add `prompt_version` column retroactively; backfill with version `"unknown"`; write migration query for known-old records |
| Groq rate limit exhaustion during large batch | LOW | Add exponential backoff with jitter to `_transcribe_groq`; process ads in smaller batches (10 at a time max); use Groq's free tier 7200 audio-seconds/hour budget carefully |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Expired media CDN URLs | Phase 1 — DB Schema + Data Model | Confirm media is downloaded to Supabase Storage or downloaded immediately at collection time before storing |
| Apify empty dataset / silent blocking | Phase 1 — Apify Integration + Webhook | Test with a known-small or inactive page to verify zero-item detection fires alert |
| RLS missing on new tables | Phase 1 — DB Schema + Migration | Query each new table with anon key after migration; expect 403 or filtered results |
| FastAPI background task failure visibility | Phase 1 — Core Pipeline Infrastructure | Confirm `ad_collection_runs` table reflects success/failure after each test run |
| LLM JSON parse failure corruption | Phase 2 — LLM Analysis Pipeline | Run 20 test ads and verify 0 records with `parse_failed` in analysis column |
| Groq 25MB file size limit | Phase 3 — Media Processing | Test with a 3+ minute video ad; verify size check fires before API call |
| Prompt schema drift | Phase 2 — LLM Analysis Pipeline | Confirm `prompt_version` field present in table and populated after first test batch |
| Hardcoded API keys as fallbacks in config | Phase 1 — Environment Configuration | CI check or startup validation that all keys come from env vars; no inline defaults |
| Breaking existing webhooks | Any phase touching `main.py` | Run existing webhook integration tests before and after merging new endpoints |

---

## Sources

- [Apify Facebook Ads Scraper — "Blocked from Searching" issue thread](https://apify.com/apify/facebook-ads-scraper/issues/request-failed-and-r-Ma0pkqnoX8XBACJeG)
- [Apify Facebook Ads Scraper — "Ads info missing" issue thread](https://apify.com/curious_coder/facebook-ads-library-scraper/issues/ads-info-missing-ibs0xxYu3qPJzWLIH)
- [Fivetran — Facebook Ads "URL Signature Expired" troubleshooting](https://fivetran.com/docs/applications/facebook-ads/troubleshooting/url-signature-expired)
- [Groq Rate Limits Documentation](https://console.groq.com/docs/rate-limits) — 20 RPM / 7200 ASH on free plan for Whisper
- [Groq Speech to Text Documentation](https://console.groq.com/docs/speech-to-text) — 25MB file limit (URL-based: 100MB on paid)
- [Meta Marketing API — Rate Limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS disabled by default on SQL-created tables
- [Supabase — Enable RLS by default discussion](https://github.com/orgs/supabase/discussions/21747) — Dashboard vs SQL editor behavior difference
- [FastAPI Background Tasks pitfalls — Leapcell](https://leapcell.io/blog/understanding-pitfalls-of-async-task-management-in-fastapi-requests)
- [LLM JSON parsing failures — Developer's Guide (Medium)](https://medium.com/@sonitanishk2003/from-chaos-to-structure-a-developers-guide-to-reliable-json-from-llms-de6dc0ffde07)
- Codebase review: `Fluxos em Python/flows/videos.py`, `utils.py`, `config.py` — live code patterns that carry over into the new pipeline

---
*Pitfalls research for: Ad Intelligence Pipeline (v1.1 milestone) added to existing Criativos app*
*Researched: 2026-03-26*
