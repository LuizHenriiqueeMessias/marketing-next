# Stack Research

**Domain:** Ad Intelligence Pipeline — Facebook Ad Library scraping, video transcription, image analysis, copy analysis, dashboard
**Researched:** 2026-03-26
**Confidence:** MEDIUM (Apify actor output schema LOW due to dynamic platform docs; all other areas MEDIUM-HIGH)

---

## Scope

This file covers ONLY new additions for v1.1. The following are already in the stack and must NOT be re-added:

| Already Available | Used For |
|-------------------|----------|
| `anthropic` (Python) | Copy analysis and image vision |
| `httpx` | HTTP calls from FastAPI |
| `fastapi` + `uvicorn` | Backend server |
| `@supabase/supabase-js` | Frontend DB client |
| `supabase` (Python via `httpx`) | Backend DB access |
| `react-router-dom`, `tailwindcss`, Radix UI | Frontend routing and UI |
| Apify integration pattern | Already used for inspiration scraping |

---

## Recommended Stack — New Additions

### Backend (Python / FastAPI)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `apify-client` | 2.5.0 | Run Apify actors, fetch dataset results | Official Apify Python SDK; `.call()` blocks until actor finishes, `.list_items()` fetches results. Already pattern-matched to existing Apify usage. |
| `APScheduler` | 3.11.2 | Recurring collection jobs (daily/weekly scraping) | 3.x is the stable series (4.x still alpha as of April 2025). `AsyncIOScheduler` integrates cleanly with FastAPI's lifespan context manager. No extra broker needed. |

### Frontend (React / Vite)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `recharts` | 3.x (3.8.1 current) | Bar/line/pie charts for ad performance dashboard | Built on D3 + React, SVG-native, declarative API matches the project's component style. Most-used React chart library for dashboards of this scale. No canvas abstraction needed. |
| `@tanstack/react-table` | 8.21.3 | Ads data table with filtering, sorting, pagination | Headless — fully compatible with existing Radix/Tailwind design system. No CSS conflicts. Handles server-side and client-side filtering without a full data-grid framework. |

### Scheduling Decision

Use **APScheduler `AsyncIOScheduler`** inside FastAPI, NOT Supabase pg_cron.

Rationale:
- Supabase pg_cron can only invoke SQL or HTTP endpoints. It cannot directly orchestrate multi-step pipelines (scrape → download video → transcribe → analyze → store). It would require a public-facing webhook endpoint and a separate orchestration layer.
- APScheduler runs in-process inside FastAPI. The collection pipeline (call Apify actor, wait for result, iterate ads, call Groq, call Claude) is naturally expressed as a single async Python function. The scheduler calls that function on a cron interval.
- For this project's scale (one scrape job per competitor page, daily or weekly), in-process scheduling is sufficient. No message broker, no Redis, no separate worker process.
- Supabase pg_cron is appropriate when you need to schedule pure SQL operations or trigger Edge Functions. Neither applies here.

---

## Supporting Libraries — Considered But Not Needed

| Library | Verdict | Reason |
|---------|---------|--------|
| `pandas` / `openpyxl` | NOT needed | Apify Python client returns data as Python dicts via `list_items()`. No Excel parsing required — JSON is the native format. Only needed if you export/import via Excel UI, which is not a planned feature. |
| `celery` + Redis | NOT needed | Overkill for a single periodic scrape job. Requires Redis broker, separate worker process, Celery Beat. APScheduler in-process covers all requirements. |
| `sqlalchemy` | NOT needed | Already using Supabase REST via httpx. Introducing an ORM would split persistence concerns. |

---

## Supabase Schema Additions

No new Supabase extension is needed. New tables in the existing PostgreSQL instance:

### New Tables

**`competitor_pages`** — the Facebook pages being monitored
```
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
name        text NOT NULL
page_id     text NOT NULL UNIQUE      -- Facebook page ID
created_at  timestamptz DEFAULT now()
```

**`competitor_ads`** — one row per scraped ad
```
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
competitor_page_id uuid REFERENCES competitor_pages(id)
ad_archive_id     text UNIQUE           -- Apify output: ad's unique Meta ID
ad_text           text                  -- ad copy body
video_url         text                  -- direct video URL if present
image_urls        text[]                -- array of image URLs
start_date        date
end_date          date
platforms         text[]                -- ["facebook", "instagram"]
status            text                  -- active | inactive
raw_apify_data    jsonb                 -- full Apify output record (future-proof)
created_at        timestamptz DEFAULT now()
```

**`ad_analyses`** — AI analysis results per ad (one-to-one with competitor_ads)
```
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
ad_id            uuid REFERENCES competitor_ads(id) UNIQUE
transcript       text                  -- Groq Whisper output
image_description text                 -- Claude Vision output
hook             text
angle            text
structure        text
cta              text
score            smallint              -- 1-10
analysis_raw     jsonb                 -- full Claude response (for debugging)
analyzed_at      timestamptz DEFAULT now()
```

**Why JSONB for `raw_apify_data` and `analysis_raw`:** Apify's output schema varies by actor version. Storing the raw payload in JSONB lets you add derived columns later without a migration. Claude's structured analysis output can also shift as prompts evolve.

**Why NOT SQLite:** The milestone context mentioned SQLite as an original plan. SQLite is inappropriate here because the app already uses Supabase/PostgreSQL with RLS, auth context, and the existing schema. Introducing a second DB engine would split access patterns, break Row Level Security, and require a separate connection management strategy. Supabase PostgreSQL handles this workload easily.

---

## Apify Actor

**Recommended actor:** `apify/facebook-ads-scraper`

This is the official Apify-maintained actor (not a community fork). Use this over alternatives like `curious_coder/facebook-ads-library-scraper` because:
- Official actors have SLA-style maintenance — Meta API changes get patched faster
- Community actors like `curious_coder/` may go unmaintained without notice

**Input pattern (Python):**
```python
from apify_client import ApifyClient

client = ApifyClient(token=APIFY_API_TOKEN)

run_input = {
    "searchTerms": ["brand name"],          # keyword search
    "pageIds": ["123456789"],               # or specific FB page IDs
    "country": "BR",
    "adType": "ALL",                        # ALL | POLITICAL_AND_ISSUE_ADS
    "maxAds": 100,
}

run = client.actor("apify/facebook-ads-scraper").call(run_input=run_input)
items = client.dataset(run["defaultDatasetId"]).list_items().items
```

**Expected output fields per ad (MEDIUM confidence — verify on first run):**
- `adArchiveId` — unique Meta ad ID
- `adText` / `bodyText` — copy text
- `startDate` / `endDate`
- `pageName`, `pageId`
- `snapshot.videos[].videoHdUrl` or `videoSdUrl` — video download URLs
- `snapshot.images[].originalImageUrl` — image URLs
- `platforms` — where the ad ran
- `status` — ACTIVE / INACTIVE

**Confidence note:** Apify's actor pages are JavaScript-rendered and blocked WebFetch. Output schema is LOW confidence based on secondary sources. Test with a real run before finalizing column names in the `competitor_ads` table. Use `raw_apify_data jsonb` to absorb schema differences.

---

## Installation

```bash
# Backend — add to requirements.txt
apify-client==2.5.0
APScheduler==3.11.2

# Frontend — add to package.json
npm install recharts @tanstack/react-table
```

---

## Alternatives Considered

| Recommended | Alternative | When Alternative Makes Sense |
|-------------|-------------|-------------------------------|
| `APScheduler` in-process | Supabase pg_cron | When job is pure SQL or triggers an Edge Function; not multi-step Python pipeline |
| `APScheduler` in-process | Celery Beat + Redis | When you need distributed workers, job retries, or the scrape job takes >10 min and needs separate process isolation |
| `recharts` | `react-chartjs-2` | When rendering 500k+ data points; Canvas outperforms SVG at extreme scale. Not needed here. |
| `recharts` | `visx` | When you need custom D3 primitives and can spend time on low-level layout. Overkill for a standard dashboard. |
| `@tanstack/react-table` | AG Grid Community | When you need Excel-like features (copy-paste cells, formulas). Adds ~500KB and opinionated CSS. |
| `apify/facebook-ads-scraper` | `curious_coder/facebook-ads-library-scraper` | If official actor breaks and the community actor gets faster patches |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `APScheduler` 4.0.0a* | Still in alpha as of April 2025; API redesigned, no stable docs | `APScheduler==3.11.2` |
| `pandas` for Apify data | Adds 30MB+ to container, not needed — `apify-client` returns Python dicts | `apify-client` `.list_items()` directly |
| SQLite as second DB | Splits auth/RLS, breaks existing Supabase patterns, no concurrent writes from multiple requests | Supabase PostgreSQL (already in use) |
| `react-query` or `swr` | Would be useful but is not currently in the stack — only add if dashboard needs background refresh. Defer to implementation decision. | React `useEffect` + `useState` (already used) |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `APScheduler==3.11.2` | Python 3.10+ | Project is already Python 3.10+ per `apify-client` requirement |
| `apify-client==2.5.0` | Python 3.10+ | Confirmed on PyPI (released 2026-02-18) |
| `recharts@3.x` | React 18+, React 19 | Project uses React 19.2.4 — compatible |
| `@tanstack/react-table@8.21.3` | React 16.8+, React 19 | Hooks-based, no class components |

---

## Sources

- [Apify Python Client — PyPI](https://pypi.org/project/apify-client/) — version 2.5.0, Python 3.10+ requirement (HIGH confidence)
- [APScheduler PyPI](https://pypi.org/project/APScheduler/) — 3.11.2 stable, 4.0.0a6 still alpha (HIGH confidence)
- [APScheduler 3.x AsyncIOScheduler docs](https://apscheduler.readthedocs.io/en/3.x/modules/schedulers/asyncio.html) — asyncio integration (HIGH confidence)
- [Apify Facebook Ads Scraper](https://apify.com/apify/facebook-ads-scraper) — actor ID and general capabilities (MEDIUM confidence, page JS-rendered)
- [Apify blog: scrape Facebook ads](https://blog.apify.com/scrape-facebook-ads-data/) — input patterns and output field categories (MEDIUM confidence)
- [Recharts npm](https://www.npmjs.com/package/recharts) — version 3.8.1 current (HIGH confidence)
- [TanStack Table latest](https://tanstack.com/table/latest) — v8 stable, `@tanstack/react-table` (HIGH confidence)
- [Supabase Cron docs](https://supabase.com/docs/guides/cron) — pg_cron capabilities and HTTP invocation (HIGH confidence)
- [Leapcell: APScheduler vs Celery Beat](https://leapcell.io/blog/scheduling-tasks-in-python-apscheduler-vs-celery-beat) — scheduling tradeoffs (MEDIUM confidence)
- [LogRocket: Best React chart libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/) — Recharts recommendation rationale (MEDIUM confidence)

---

*Stack research for: Ad Intelligence Pipeline (v1.1) — Criativos*
*Researched: 2026-03-26*
