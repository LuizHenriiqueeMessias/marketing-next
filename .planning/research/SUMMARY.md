# Project Research Summary

**Project:** Criativos — Ad Intelligence Pipeline (v1.1)
**Domain:** Competitive Ad Intelligence — Facebook Ad Library scraping, media processing, LLM analysis, and dashboard
**Researched:** 2026-03-26
**Confidence:** MEDIUM (Apify actor output schema LOW; all other areas MEDIUM-HIGH)

## Executive Summary

The Ad Intelligence feature adds a competitive monitoring layer to the existing Criativos app. The pattern is already established in the codebase: Apify scrapes content, Groq Whisper transcribes video audio, Claude analyzes the content, results are stored in Supabase, and a React dashboard reads directly from the database. The new feature follows this exact pipeline but targets Facebook Ad Library ads from competitor pages rather than inspiration content from owned accounts. The build is primarily additive — new tables, one new flow module, one new React page — with minimal modification to existing code.

The recommended implementation strategy is to mirror the existing `inspiration_profiles → inspiration_posts → readapted_posts` data model with three new tables (`ad_competitors`, `ad_creatives`, `ad_analyses`) and a new flow module (`flows/ads.py`) that reuses the existing utility layer without duplication. The frontend follows the same structural pattern as `pages/Inspiracao/`, reading Supabase directly with the JS client rather than calling FastAPI for data. New stack additions are minimal: `apify-client` and `APScheduler` on the backend, `recharts` and `@tanstack/react-table` on the frontend.

The primary risks are concentrated in data integrity and external API reliability. Facebook CDN URLs expire within hours — media must be downloaded at collection time, not stored as raw URLs. Apify can silently return empty datasets when blocked by Facebook rather than raising errors. Claude JSON output can fail to parse under long inputs, silently corrupting analysis records if not caught. These three risks must be designed out in Phase 1 and Phase 2 before any data flows through the pipeline, because recovery from corrupted or missing data is more expensive than preventing it.

---

## Key Findings

### Recommended Stack

The new additions are deliberately minimal. On the backend, `apify-client==2.5.0` (official Apify Python SDK) is required for running actors and fetching datasets, and `APScheduler==3.11.2` (stable 3.x series — 4.x is still alpha) provides in-process async scheduling via `AsyncIOScheduler`. APScheduler is preferred over Supabase pg_cron because the pipeline is a multi-step Python function, not a SQL operation or Edge Function call. Celery is explicitly ruled out as overkill for a single periodic scrape job. On the frontend, `recharts` (SVG-native, declarative, React 19 compatible) handles dashboard charts and `@tanstack/react-table` (headless, no CSS conflicts with existing Radix/Tailwind system) handles the ads data table. No ORM, no second database, no additional infrastructure.

**Core technologies (new additions):**
- `apify-client==2.5.0`: Run Facebook Ad Library actor, fetch dataset results — official SDK, matches existing Apify usage pattern
- `APScheduler==3.11.2`: Recurring collection jobs — `AsyncIOScheduler` integrates with FastAPI lifespan, no broker required
- `recharts@3.x`: Ad performance dashboard charts — React 19 compatible, SVG-based, declarative API
- `@tanstack/react-table@8.21.3`: Ads table with filtering/sorting/pagination — headless, zero CSS conflict with existing Radix/Tailwind

**Critical version note:** Use `APScheduler==3.11.2`, not 4.0.0a* (still in alpha with redesigned API and no stable docs).

### Expected Features

The feature set has a clear two-tier structure. The v1.1 core (P1) must deliver a working intelligence pipeline from competitor page management through AI analysis display. The follow-on tier (P2) adds scheduling, alerting, and export once the team validates the core is useful.

**Must have (table stakes — v1.1 core):**
- Competitor page management (add/remove Meta page IDs) — without this nothing else works
- Manual collection trigger per competitor — team can pull fresh data on demand
- Ad card list with filters (date range, format, active/inactive) — the core browsing experience
- Ad detail view with creative (image/video), full copy, platform, CTA
- Video transcription via Groq Whisper — reuses existing capability
- Claude analysis with structured output: hook text, hook type, angle tag, CTA, structure summary, score 1-10
- AI analysis results rendered on ad card and detail view

**Should have (differentiators — add after validation):**
- Scheduled recurring collection (weekly per competitor page)
- New ads badge/indicator — visual signal of what's new since last visit
- Export to CSV — team uses data in reports and briefs
- Competitor grouping — organization when tracking 10+ pages

**Defer (v2+):**
- Side-by-side ad comparison — HIGH complexity, niche use case
- Aggregate creative stats per competitor — needs data volume to be meaningful
- Cross-platform support (TikTok, Google) — separate actors + data models, scope doubles per platform
- External notifications (email/Slack) — in-app badge is sufficient at launch

**Anti-features to avoid:** Real-time streaming (Apify is batch-only), estimated ad spend tracking (Facebook only exposes ranges for political ads), automatic performance scoring (the app has no access to competitor metrics — scores must be labeled as AI-assessed creative quality).

### Architecture Approach

The new feature maps directly onto the existing architecture without introducing new patterns. Frontend reads Supabase directly (never calls FastAPI for data). FastAPI receives Apify webhooks, processes in BackgroundTasks, writes to Supabase. The data model mirrors `inspiration_profiles → inspiration_posts → readapted_posts` as `ad_competitors → ad_creatives → ad_analyses`. The analysis table is deliberately separate from `ad_creatives` (not a JSONB column on the same table) to avoid the JSON-inside-JSON parsing issues visible in the existing `inspiration_posts.analysis` field. The `_transcribe_groq` utility should be moved from `flows/videos.py` into `utils.py` during this milestone so both the videos flow and the new ads flow share the same implementation.

**Major components:**

1. **`supabase/migrations/20260326_ad_intelligence.sql`** — Three new tables with RLS enabled and indexes; this is the foundation everything else depends on
2. **`flows/ads.py` + `POST /webhook/ads`** — New flow module following the exact structure of `flows/videos.py`; reuses `fetch_apify_dataset`, `call_claude`, `parse_llm_json`, `supabase_post` from `utils.py`
3. **`POST /ad-intelligence/collect`** — Frontend-facing endpoint to trigger a new Apify actor run for a competitor page
4. **`pages/AdIntelligence/`** — New React page with `CompetitorList.tsx`, `AdsTable.tsx`, `AdDetailDrawer.tsx`, following `pages/Inspiracao/` structure exactly
5. **`SYSTEM_AD_ANALYSIS` in `prompts.py`** — Analytical (not generative) Claude prompt returning structured JSON: hook, angle, structure, cta_analysis, score, insights

**Build order (dependency-respecting):** DB schema → Backend utils + prompt → Flow + webhook → Frontend types → Frontend components → Collection trigger → Analysis detail → Navigation.

### Critical Pitfalls

1. **Expired Facebook CDN URLs** — Apify returns time-limited signed URLs. Store media in Supabase Storage (or download to memory for transcription) immediately during webhook processing. Never store raw CDN URLs as the primary media reference. Broken thumbnail fallback with `onError` is mandatory in all `<img>` tags.

2. **Apify silently returning empty datasets** — Facebook blocks scraping at the HTTP level, causing the actor to return 0 items with a 200 status. Always validate item count after dataset fetch: 0 items for a 50+ ad request must be logged as a collection failure and surfaced to the user, not silently accepted.

3. **LLM JSON parse failures corrupting records** — The existing `parse_llm_json()` returns an error dict on failure, which gets stored as data. For ad analysis: set `max_tokens` to at least 4000, add a retry with explicit error feedback if parsing fails, store a `prompt_version` field from day one, and add a `parse_failed` flag check before saving — do not write corrupt data to the database.

4. **RLS missing on new Supabase tables** — SQL-created tables have RLS disabled by default. Tables without policies are publicly readable via the anon key. Every migration that creates a table must include `ALTER TABLE [table] ENABLE ROW LEVEL SECURITY` and at least one policy in the same file. Verify by querying each new table with the anon key after migration.

5. **FastAPI background task failures are invisible** — A failed `BackgroundTask` returns no signal to the caller (Apify already received its 200). Add a `ad_collection_runs` tracking table that records run start, progress, and final status. This gives the dashboard visibility into stuck or failed runs without requiring log access.

---

## Implications for Roadmap

Based on combined research, the feature decomposes naturally into phases that respect the dependency chain from FEATURES.md and the build order from ARCHITECTURE.md. Every phase must address its mapped pitfalls before moving to the next.

### Phase 1: Database Foundation and Core Infrastructure

**Rationale:** Every other phase depends on the schema existing and the pipeline infrastructure being reliable. Pitfalls 1 (expired URLs), 2 (empty datasets), 4 (RLS), and 5 (invisible background failures) must all be addressed here — they are impossible to retrofit cleanly after data is flowing.

**Delivers:** Supabase migration with three new tables, RLS policies, indexes; `ad_collection_runs` tracking table; media persistence strategy defined; Apify empty-dataset detection in webhook handler; `ad_collection_runs` status tracking; environment variable validation on startup.

**Addresses features:** Competitor page management (CRUD), manual collection trigger.

**Avoids pitfalls:** Expired CDN URLs (define media storage strategy before writing download code), empty dataset silent failure (build detection into webhook handler), RLS misconfiguration (include policy in migration file), invisible background failures (implement run tracking table), API keys as fallback defaults in config.

**Research flag:** Standard patterns — no additional research needed. Schema mirrors existing tables. Pitfall mitigations are explicit in PITFALLS.md.

### Phase 2: Ad Collection Pipeline (Apify Integration + Backend Flow)

**Rationale:** The collection pipeline must work end-to-end and be testable before the frontend depends on it. The backend can be tested with a real Apify run and direct Supabase inspection — no frontend needed.

**Delivers:** `flows/ads.py` with `process_ads()`; `POST /webhook/ads` and `POST /ad-intelligence/collect` endpoints; `SYSTEM_AD_ANALYSIS` prompt in `prompts.py`; new utils helpers (`save_ad_creative`, `save_ad_analysis`); `_transcribe_groq` moved to `utils.py`.

**Addresses features:** Manual collection trigger (backend side), video transcription, image analysis via OpenRouter vision.

**Avoids pitfalls:** LLM JSON parse failures (set max_tokens 4000, add retry logic, add `prompt_version` and `parse_failed` flag before saving), Groq 25MB file size limit (add size check before Whisper call, add `transcription_skipped: file_too_large` marker for oversized files), breaking existing webhooks (test existing endpoints before and after adding new routes to `main.py`).

**Research flag:** Needs validation — Apify actor output field names are MEDIUM confidence (schema may differ from docs). First real actor run must be inspected before finalizing column mappings. `raw_apify_data jsonb` column absorbs schema differences until confirmed.

### Phase 3: Ad Display Dashboard (Frontend Core)

**Rationale:** Build read-before-write on the frontend. The ads table and competitor list can display data immediately once Phase 2 has populated the database. Collection trigger UI is added last in this phase since it depends on the display being ready.

**Delivers:** `pages/AdIntelligence/` page structure (`CompetitorList.tsx`, `AdsTable.tsx`, `AdDetailDrawer.tsx`, `NewCompetitorDialog.tsx`); Supabase types added to `integrations/supabase/types.ts`; route and nav item added; `@tanstack/react-table` integrated for ad list; ad detail drawer with analysis display.

**Addresses features:** Ad card list with filters (date range, format, active/inactive), ad detail view with full creative and analysis, copy/hook/CTA/score display, competitor page management (UI), manual collection trigger (frontend button).

**Avoids pitfalls:** Expired thumbnail URLs (use `onError` fallback on all `<img>` tags, show placeholder), raw LLM JSON fields displayed without fallback (use optional chaining + null coalescing everywhere — `analysis?.hook_type ?? 'Not analyzed'`), no date context on ads (always display collection date and ad start/end date prominently), no visibility into collection run status (show run status badge per competitor reading from `ad_collection_runs`).

**Research flag:** Standard patterns — follows existing `Inspiracao` page structure exactly. No additional research needed.

### Phase 4: Scheduling and Automated Collection

**Rationale:** Defer until the team is using the manual collection flow daily. Scheduling adds complexity (deduplication, run conflict detection) that is not needed until the core pipeline is validated.

**Delivers:** `APScheduler AsyncIOScheduler` integrated into FastAPI lifespan; weekly cron job per `ad_competitors.is_active` record; deduplication check before triggering new run (compare last collection timestamp); new ads badge/indicator (`is_new` boolean on `ad_creatives`).

**Addresses features:** Scheduled recurring collection, new ads badge/indicator.

**Avoids pitfalls:** Duplicate runs from scheduler (check last collection timestamp before triggering), no deduplication check before Apify runs (track last_collected_at per competitor).

**Research flag:** Standard patterns — APScheduler AsyncIOScheduler with FastAPI lifespan is well-documented. No additional research needed.

### Phase 5: Export and Organization (Follow-on)

**Rationale:** Low complexity, high team utility. Add only after the core is proven useful and the team's specific reporting needs are clear.

**Delivers:** CSV export endpoint for filtered ad list; competitor grouping field on `ad_competitors`; group filter in frontend.

**Addresses features:** Export to CSV, competitor grouping.

**Research flag:** Standard patterns — skip research.

### Phase Ordering Rationale

- Phases 1 and 2 are backend-only and must complete before the frontend can display real data. The two-phase split (infrastructure first, then pipeline) forces pitfall mitigations to be in place before any data flows.
- Phase 3 is the first user-visible deliverable. By building read UI before scheduling, the team can validate data quality and dashboard UX before automating collection.
- Phase 4 (scheduling) is explicitly deferred following the FEATURES.md recommendation — add when the team asks "why do I have to click every time?"
- Phase 5 adds value without changing the data model or pipeline, making it the safest follow-on.

### Research Flags

Needs deeper validation during implementation:
- **Phase 2:** Apify actor output field names require validation against a real run. Do not finalize column mappings until the first `apify/facebook-ads-scraper` run is inspected. The `raw_apify_data jsonb` column is specifically designed to absorb this uncertainty.

Standard patterns (skip research-phase):
- **Phase 1:** Schema mirrors existing pattern exactly (inspiration_profiles → inspiration_posts → readapted_posts)
- **Phase 3:** Page structure mirrors `pages/Inspiracao/` exactly
- **Phase 4:** APScheduler with FastAPI lifespan is well-documented in official APScheduler 3.x docs
- **Phase 5:** CSV export is a simple filtered query as file response

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | All libraries confirmed on PyPI/npm with correct versions. Apify actor capabilities are MEDIUM due to JS-rendered documentation. |
| Features | MEDIUM-HIGH | Feature set grounded in competitor tool analysis (Adligator, Foreplay, MagicBrief) and existing team usage patterns. Anti-features identified from documented platform limitations. |
| Architecture | HIGH | Based on direct codebase inspection. Existing patterns are clear and the new feature maps cleanly onto them. No speculative decisions. |
| Pitfalls | HIGH (integration) / MEDIUM (external APIs) | Integration pitfalls from live codebase review are HIGH confidence. External API behavior (Apify blocking patterns, Groq rate limits) from docs and community reports are MEDIUM confidence. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Apify output schema:** Field names in `apify/facebook-ads-scraper` output are MEDIUM confidence from secondary sources. Treat all Apify field mappings as provisional until a real actor run is inspected. The `raw_apify_data jsonb` column on `ad_creatives` is the explicit mitigation — store the full raw item to allow retroactive column extraction.

- **Facebook blocking frequency:** How often Apify returns 0 results due to Facebook blocking is unknown for this specific use case (competitor brand pages vs general keyword searches). The empty-dataset detection mitigates the impact, but the operational frequency of re-runs needed is unknown until real usage data is collected.

- **Groq language handling for Portuguese ads:** Whisper should handle Portuguese but the existing pipeline has no explicit language hint. For Brazilian Portuguese ad content, adding `language: "pt"` to Groq API calls may improve accuracy and should be verified in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `Fluxos em Python/main.py`, `utils.py`, `prompts.py`, `config.py`, `flows/videos.py`, `flows/estaticos.py`, `flows/carrossel.py`
- Direct codebase inspection: `frontend/src/pages/Inspiracao/index.tsx`, `App.tsx`, `Layout.tsx`, `integrations/supabase/types.ts`
- Direct codebase inspection: `supabase/migrations/00_full_schema.sql`
- [Apify Python Client — PyPI](https://pypi.org/project/apify-client/) — version 2.5.0, Python 3.10+
- [APScheduler PyPI](https://pypi.org/project/APScheduler/) — 3.11.2 stable confirmed
- [APScheduler 3.x AsyncIOScheduler docs](https://apscheduler.readthedocs.io/en/3.x/modules/schedulers/asyncio.html)
- [Recharts npm](https://www.npmjs.com/package/recharts) — version 3.8.1, React 19 compatible
- [TanStack Table v8](https://tanstack.com/table/latest) — stable, headless
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Groq Speech to Text Documentation](https://console.groq.com/docs/speech-to-text) — 25MB limit confirmed
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits) — 7200 ASH/hour free tier

### Secondary (MEDIUM confidence)
- [Apify Facebook Ads Scraper actor page](https://apify.com/apify/facebook-ads-scraper) — actor capabilities, input/output schema
- [Apify blog: scrape Facebook ads](https://blog.apify.com/scrape-facebook-ads-data/) — input patterns and output field categories
- [12 Best Facebook Ads Spy Tools for 2026](https://proven-saas.com/blog/12-best-facebook-ads-spy-tools-for-2026-find-winning-ads) — competitor feature comparison
- [Foreplay vs MagicBrief 2026](https://admanage.ai/blog/foreplay-vs-magicbrief) — AI analysis feature benchmarks
- [Fivetran — Facebook Ads URL Signature Expired](https://fivetran.com/docs/applications/facebook-ads/troubleshooting/url-signature-expired) — CDN URL expiry behavior
- [FastAPI Background Tasks pitfalls — Leapcell](https://leapcell.io/blog/understanding-pitfalls-of-async-task-management-in-fastapi-requests)
- [LLM JSON parsing failures guide](https://medium.com/@sonitanishk2003/from-chaos-to-structure-a-developers-guide-to-reliable-json-from-llms-de6dc0ffde07)

### Tertiary (LOW confidence — requires validation)
- Apify actor output field names (`adArchiveId`, `adText`, `snapshot.videos[].videoHdUrl`, etc.) — from community documentation and blog posts; must verify against real actor run output before finalizing DB column names

---

*Research completed: 2026-03-26*
*Ready for roadmap: yes*
