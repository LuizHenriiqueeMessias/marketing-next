# Architecture Research

**Domain:** Ad Intelligence Pipeline integration into existing Criativos app
**Researched:** 2026-03-26
**Confidence:** HIGH — based on direct codebase inspection

## Existing Architecture (Baseline)

Before describing what to add, here is what exists and the exact patterns the new feature must follow.

### Current System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React/Vite — Vercel)                                 │
│  ┌───────────┐ ┌──────────────┐ ┌────────────┐ ┌────────────┐  │
│  │Inspiracao │ │  Scrapping   │ │ Readaptados│ │ Usuarios   │  │
│  │ (profiles │ │  Especifico  │ │            │ │            │  │
│  │  + posts) │ │              │ │            │ │            │  │
│  └─────┬─────┘ └──────┬───────┘ └─────┬──────┘ └─────┬──────┘  │
│        │              │               │               │         │
│        └──────────────┴───────────────┴───────────────┘         │
│                              │                                  │
│                    Supabase JS client (direct)                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Supabase PostgreSQL                                            │
│  ┌──────────────────┐  ┌───────────────────┐                   │
│  │inspiration_profiles│  │inspiration_targets│                   │
│  └──────────────────┘  └───────────────────┘                   │
│  ┌──────────────────┐  ┌───────────────────┐                   │
│  │ inspiration_posts │  │  readapted_posts  │                   │
│  └──────────────────┘  └───────────────────┘                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ service_role key (bypasses RLS)
┌──────────────────────────────▼──────────────────────────────────┐
│  Backend (FastAPI — Render/Fly)                                 │
│  POST /webhook/estaticos  → flows/estaticos.py                  │
│  POST /webhook/carrossel  → flows/carrossel.py                  │
│  POST /webhook/videos     → flows/videos.py                     │
│                                                                 │
│  All flows share: utils.py (Supabase helpers, call_claude,      │
│  fetch_apify_dataset, transcribe_groq) + prompts.py             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  External APIs                                                  │
│  Apify (scraping) │ Anthropic Claude │ Groq Whisper │ OpenRouter│
└─────────────────────────────────────────────────────────────────┘
```

### Key Existing Patterns

**Pattern A — Webhook-as-entry-point:** Apify scraper finishes, calls FastAPI webhook with `resource.defaultDatasetId`. FastAPI returns 200 immediately and runs processing in `BackgroundTasks`. Never blocks.

**Pattern B — Flow module per content type:** Each type (estaticos, carrossel, videos) is its own file in `flows/`. New feature type = new file in `flows/`.

**Pattern C — Shared utility layer:** `utils.py` owns all I/O (Supabase REST, Apify fetch, Claude call, Groq Whisper). Flows import from utils — never call external APIs directly. New flows add new helpers to `utils.py`, never duplicate.

**Pattern D — Frontend talks only to Supabase:** The React frontend uses the Supabase JS client directly (`@/integrations/supabase/client`). It never calls the FastAPI backend. The backend writes to DB; frontend reads from DB. The only exception is the Supabase Edge Functions (separate from the React frontend).

**Pattern E — Background task processing is fire-and-forget:** Frontend triggers collection by calling a FastAPI endpoint (or an Edge Function that triggers Apify). Frontend polls Supabase for new rows — no websockets or long-polling needed.

---

## New Feature: Ad Intelligence Pipeline

### What Changes vs What Stays

| Layer | Status | What |
|-------|--------|------|
| Supabase DB | NEW tables | `ad_competitors`, `ad_creatives`, `ad_analyses` |
| FastAPI backend | NEW webhook + NEW flow | `/webhook/ads` + `flows/ads.py` |
| FastAPI backend | MODIFIED | `utils.py` gets ad-specific Supabase helpers |
| FastAPI backend | MODIFIED | `config.py` gets `CLAUDE_MODEL_ADS` constant |
| FastAPI backend | NEW | `prompts.py` gets `SYSTEM_AD_ANALYSIS` prompt |
| React frontend | NEW page | `pages/AdIntelligence/` (route `/ad-intelligence`) |
| React frontend | MODIFIED | `Layout.tsx` — add nav item |
| React frontend | MODIFIED | `App.tsx` — add route |
| React frontend | MODIFIED | `integrations/supabase/types.ts` — add new table types |

---

## New Database Schema

### New Tables

```sql
-- 1. ad_competitors: brands being monitored (analogous to inspiration_profiles)
CREATE TABLE ad_competitors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,            -- display name, e.g. "Nubank"
  fb_page_id  text,                     -- Facebook Page ID for Ad Library
  fb_page_url text,                     -- Page URL passed to Apify actor
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. ad_creatives: raw ads collected from Apify (analogous to inspiration_posts)
CREATE TABLE ad_creatives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id   uuid NOT NULL REFERENCES ad_competitors(id) ON DELETE CASCADE,
  ad_id           text,                 -- Facebook ad_archive_id (dedup key)
  ad_url          text,
  creative_type   text,                 -- 'video' | 'image' | 'carousel'
  thumbnail_url   text,
  video_url       text,
  image_urls      text[],
  body_text       text,                 -- ad copy / caption
  cta_type        text,                 -- LEARN_MORE, SHOP_NOW, etc.
  start_date      date,
  status          text,                 -- ACTIVE | INACTIVE
  transcricao     text,                 -- filled by Whisper after collection
  raw_apify_data  jsonb,                -- full Apify item for reference
  collected_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_ad_creatives_ad_id ON ad_creatives(ad_id) WHERE ad_id IS NOT NULL;
CREATE INDEX idx_ad_creatives_competitor_id ON ad_creatives(competitor_id);

-- 3. ad_analyses: Claude analysis result (analogous to readapted_posts minus the "readaptation")
CREATE TABLE ad_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id     uuid NOT NULL UNIQUE REFERENCES ad_creatives(id) ON DELETE CASCADE,
  hook            text,                 -- identified hook
  angle           text,                 -- persuasion angle
  structure       text,                 -- content structure notes
  cta_analysis    text,                 -- CTA effectiveness notes
  score           numeric,              -- 0-10 overall score
  insights        text,                 -- free-text Claude insights
  full_analysis   jsonb,                -- raw Claude JSON for extensibility
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_analyses_creative_id ON ad_analyses(creative_id);
```

### Relationship Map

```
ad_competitors (1) ──── (N) ad_creatives (1) ──── (1) ad_analyses
                                  │
                           transcricao (Groq Whisper fills this column inline)
                           raw_apify_data (Apify raw)
```

**Design rationale:** Mirrors the existing `inspiration_profiles → inspiration_posts → readapted_posts` chain. Each new competitor is like a profile. Each ad is like an inspiration post. Each analysis is like a readapted post. This parallelism lets the team reuse mental models and lets the code reuse utility functions.

---

## New Backend Components

### New Webhook: `POST /webhook/ads`

Location: `main.py` — add alongside existing webhooks.

```python
@app.post("/webhook/ads")
async def webhook_ads(request: Request, background_tasks: BackgroundTasks):
    body = await request.json()
    background_tasks.add_task(process_ads, body)
    return JSONResponse({"received": True, "flow": "ads"})
```

Apify calls this when the Facebook Ad Library scrape finishes, passing `resource.defaultDatasetId` and `competitor_id` (set via webhook metadata when triggering the Apify actor).

### New Flow: `flows/ads.py`

Follows the exact same structure as `flows/videos.py`:

```
process_ads(webhook_body)
  1. Extract dataset_id + competitor_id from webhook_body
  2. fetch_apify_dataset(dataset_id)          ← reuse utils.py
  3. For each ad:
     a. If creative_type == 'video' and video_url:
        - Download audio bytes                 ← _download_audio() from videos.py or new util
        - _transcribe_groq(audio_bytes)        ← reuse or import from videos.py
     b. If creative_type == 'image':
        - call_openrouter_vision(image_url)    ← reuse carrossel.py vision call
     c. call_claude(SYSTEM_AD_ANALYSIS, ...)  ← reuse utils.call_claude
     d. save_ad_creative(...)                 ← new util in utils.py
     e. save_ad_analysis(...)                 ← new util in utils.py
```

Functions to REUSE (no copy, import directly):
- `utils.fetch_apify_dataset`
- `utils.call_claude`
- `utils.parse_llm_json`
- `utils.to_int`
- `utils.supabase_post` / `utils.supabase_get`
- `_transcribe_groq` — either import from `flows/videos.py` or move to `utils.py` (preferred, since ads also need it)

### New Prompt: `SYSTEM_AD_ANALYSIS` in `prompts.py`

New constant added to `prompts.py`. Instructs Claude to return JSON with:
```json
{
  "hook": "...",
  "angle": "...",
  "structure": "...",
  "cta_analysis": "...",
  "score": 7,
  "insights": "..."
}
```

This is a focused competitive analysis prompt, not a content creation prompt. Tone is analytical, not generative. Different purpose from existing prompts — add as a new constant, never mix with `SYSTEM_MASTER`.

### New Config Constant: `config.py`

```python
CLAUDE_MODEL_ADS = "claude-sonnet-4-20250514"  # same model, separate constant for future tuning
```

### New utils.py Helpers

```python
async def save_ad_creative(data: dict) -> str | None:
    """Salva em ad_creatives. Upsert by ad_id."""
    result = await supabase_post(
        "ad_creatives?on_conflict=ad_id", data
    )
    ...

async def save_ad_analysis(data: dict):
    """Salva em ad_analyses. Upsert by creative_id."""
    await supabase_post("ad_analyses?on_conflict=creative_id", data)

async def get_competitor_name(competitor_id: str) -> str:
    rows = await supabase_get(
        f"ad_competitors?id=eq.{competitor_id}&select=name"
    )
    return rows[0]["name"] if rows else ""
```

Moving `_transcribe_groq` from `flows/videos.py` into `utils.py` also serves ads — this is the right time to refactor it.

### New FastAPI Endpoints for Frontend

The frontend never calls FastAPI for data reading (it reads Supabase directly). The only new FastAPI endpoints needed are:

| Endpoint | Purpose | Triggers |
|----------|---------|---------|
| `POST /webhook/ads` | Receive Apify completion | Apify actor webhook |
| `POST /ad-intelligence/collect` | Frontend triggers on-demand collection | New React page "Coletar agora" button |

The collection trigger endpoint is different from the webhook — it calls the Apify API to START a new actor run and sets up the webhook callback URL. This mirrors how `ScrappingEspecifico` works on the frontend side.

---

## New Frontend Components

### New Page: `pages/AdIntelligence/`

Structure follows `pages/Inspiracao/` exactly:

```
frontend/src/pages/AdIntelligence/
├── index.tsx           # Main page — competitor list + ad table (like Inspiracao)
├── CompetitorList.tsx  # Left panel: manage competitors (like ProfileList.tsx)
├── AdsTable.tsx        # Right panel: ads per competitor (like PostsTable.tsx)
├── AdDetailDrawer.tsx  # Slide-in analysis detail (new — no equivalent)
├── NewCompetitorDialog.tsx  # Add competitor modal (like NewProfileDialog.tsx)
└── types.ts            # AdCompetitor, AdCreative, AdAnalysis TypeScript types
```

### New Nav Item in `Layout.tsx`

```tsx
{ to: "/ad-intelligence", label: "Ad Intelligence", icon: Target, adminOnly: false }
```

### New Route in `App.tsx`

```tsx
<Route path="/ad-intelligence" element={<AdIntelligence />} />
```

### New Types in `integrations/supabase/types.ts`

Extend the existing `Tables<T>` union with three new cases:
- `"ad_competitors"` — mirrors DB schema
- `"ad_creatives"` — mirrors DB schema
- `"ad_analyses"` — mirrors DB schema

---

## Data Flow: Full Ad Intelligence Pipeline

### Collection Flow (triggered by user)

```
User clicks "Coletar" in React AdIntelligence page
    │
    ▼
POST /ad-intelligence/collect {competitor_id, fb_page_url}
    │
    ▼
FastAPI triggers Apify actor (Facebook Ad Library Scraper)
  — passes webhook_url: "{BACKEND_URL}/webhook/ads"
  — passes metadata: {competitor_id}
    │
    ▼ (async — Apify runs, ~1-5 min)
    │
Apify POST /webhook/ads {resource: {defaultDatasetId}, competitor_id}
    │
    ▼ (BackgroundTask — non-blocking)
    │
flows/ads.process_ads()
    │
    ├── fetch_apify_dataset(dataset_id)
    │       ↓ list of raw ad items
    │
    ├── For each ad item:
    │     ├── [if video] download_audio → _transcribe_groq → transcricao
    │     ├── [if image] call_openrouter_vision → image_description
    │     ├── call_claude(SYSTEM_AD_ANALYSIS, ad_content) → analysis JSON
    │     ├── save_ad_creative(...)   → ad_creatives table
    │     └── save_ad_analysis(...)   → ad_analyses table
    │
    ▼
Supabase DB updated
    │
    ▼
React frontend polls / reads Supabase directly
AdIntelligence page shows updated ads automatically
```

### Read Flow (frontend viewing ads)

```
User selects competitor in CompetitorList
    │
    ▼
AdsTable queries:
  supabase.from("ad_creatives")
    .select("*, ad_analyses(*)")
    .eq("competitor_id", competitorId)
    .order("collected_at", {ascending: false})
    │
    ▼
User clicks ad row
    │
    ▼
AdDetailDrawer opens showing full analysis from ad_analyses
```

---

## Build Order (Dependency-Respecting)

The following order ensures each step can be tested before the next one depends on it.

### Step 1 — Database Foundation

Create migration file: `supabase/migrations/20260326_ad_intelligence.sql`
- Create `ad_competitors`, `ad_creatives`, `ad_analyses` tables
- Add RLS policies (copy pattern from existing tables — authenticated + service_role)
- Add indexes

**Rationale:** Everything else depends on the schema existing.

### Step 2 — Backend: Utils + Prompt

- Add `SYSTEM_AD_ANALYSIS` to `prompts.py`
- Add `CLAUDE_MODEL_ADS` to `config.py`
- Move `_transcribe_groq` from `flows/videos.py` into `utils.py` (refactor)
- Add `save_ad_creative`, `save_ad_analysis`, `get_competitor_name` to `utils.py`

**Rationale:** Flow module depends on these. Do this before writing the flow.

### Step 3 — Backend: Flow + Webhook

- Create `flows/ads.py` with `process_ads()`
- Add `POST /webhook/ads` to `main.py`
- Add `POST /ad-intelligence/collect` to `main.py`

**Rationale:** Can be tested end-to-end with a real Apify run before touching the frontend.

### Step 4 — Frontend: Types + Supabase Integration

- Add `ad_competitors`, `ad_creatives`, `ad_analyses` to `integrations/supabase/types.ts`

**Rationale:** TypeScript types needed before building components.

### Step 5 — Frontend: Core Components

- Create `pages/AdIntelligence/types.ts`
- Create `pages/AdIntelligence/CompetitorList.tsx` (add/list/delete competitors)
- Create `pages/AdIntelligence/AdsTable.tsx` (list ads per competitor, with status badges)
- Create `pages/AdIntelligence/index.tsx` (page layout, competitor selection state)

**Rationale:** Build data display before collection trigger UI.

### Step 6 — Frontend: Collection Trigger

- Add "Coletar anuncios" button to `CompetitorList.tsx` or `index.tsx`
- Wire to `POST /ad-intelligence/collect`
- Add loading/polling feedback (same pattern as `ScrappingEspecifico`)

### Step 7 — Frontend: Analysis Detail

- Create `pages/AdIntelligence/AdDetailDrawer.tsx`
- Add row click handler in `AdsTable.tsx`

### Step 8 — Frontend: Navigation

- Add `AdIntelligence` to `Layout.tsx` nav items
- Add route to `App.tsx`

---

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `flows/ads.py` | Orchestrates full ad pipeline per collection run | utils.py, Apify, Groq, Claude |
| `utils.save_ad_creative` | Upserts ad raw data with dedup on `ad_id` | Supabase REST |
| `utils.save_ad_analysis` | Upserts analysis with dedup on `creative_id` | Supabase REST |
| `AdIntelligence/index.tsx` | Page state: selected competitor, tabs | Supabase JS client |
| `CompetitorList.tsx` | CRUD for competitors, collection trigger | Supabase JS client, FastAPI `/collect` |
| `AdsTable.tsx` | Display ads with filters, select for detail | Supabase JS client |
| `AdDetailDrawer.tsx` | Full analysis view for one ad | Props from AdsTable |

---

## Integration Points: New vs Existing

### What the New Feature REUSES Without Modification

| Existing Component | Reused By |
|--------------------|-----------|
| `utils.fetch_apify_dataset` | `flows/ads.py` — same Apify dataset fetch |
| `utils.call_claude` | `flows/ads.py` — same Claude invocation pattern |
| `utils.parse_llm_json` | `flows/ads.py` — same JSON extraction |
| `utils.supabase_post/get` | New helpers `save_ad_creative`, `save_ad_analysis` |
| `utils.to_int` | Normalizing engagement metrics from Apify |
| `utils._transcribe_groq` (after moving to utils) | `flows/ads.py` for video ads |
| FastAPI `BackgroundTasks` pattern | `/webhook/ads` endpoint |
| Supabase RLS policy pattern | New table migrations |
| React page structure (profile → posts drill-down) | `AdIntelligence` follows same layout |
| `components/ui/*` (Button, Dialog, etc.) | All new React components |
| Design tokens (`var(--accent)`, `var(--surface)`, etc.) | All new React components |

### What Gets Modified

| Existing File | Change |
|--------------|--------|
| `main.py` | Add 2 new routes |
| `utils.py` | Move `_transcribe_groq` up from `flows/videos.py`, add 3 new helpers |
| `config.py` | Add `CLAUDE_MODEL_ADS` |
| `prompts.py` | Add `SYSTEM_AD_ANALYSIS` |
| `frontend/src/App.tsx` | Add route `/ad-intelligence` |
| `frontend/src/components/Layout.tsx` | Add nav item |
| `frontend/src/integrations/supabase/types.ts` | Add 3 table types |

### What Is Entirely New

| New File | Purpose |
|----------|---------|
| `supabase/migrations/20260326_ad_intelligence.sql` | DB schema |
| `Fluxos em Python/flows/ads.py` | Ad processing flow |
| `frontend/src/pages/AdIntelligence/index.tsx` | Page root |
| `frontend/src/pages/AdIntelligence/types.ts` | TypeScript types |
| `frontend/src/pages/AdIntelligence/CompetitorList.tsx` | Competitor management |
| `frontend/src/pages/AdIntelligence/AdsTable.tsx` | Ads display |
| `frontend/src/pages/AdIntelligence/AdDetailDrawer.tsx` | Analysis detail view |
| `frontend/src/pages/AdIntelligence/NewCompetitorDialog.tsx` | Add competitor modal |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Frontend Calls FastAPI for Data Reading

**What people do:** Build a `GET /ad-intelligence/ads` endpoint and have React call it.
**Why it's wrong:** The entire existing frontend reads Supabase directly. Adding a FastAPI read layer creates two data paths, auth complexity, and an extra network hop.
**Do this instead:** React queries Supabase tables directly with the JS client, exactly like `Inspiracao` and `Readaptados` do today.

### Anti-Pattern 2: Duplicating Utility Functions in the New Flow

**What people do:** Copy `_transcribe_groq` into `flows/ads.py` to avoid touching `flows/videos.py`.
**Why it's wrong:** Creates divergence — a fix in one copy doesn't propagate. The right move is to move the function to `utils.py` so both flows share it.
**Do this instead:** Refactor `_transcribe_groq` into `utils.py` as Step 2. This is a small, safe change with immediate payoff.

### Anti-Pattern 3: Separate `ad_analysis` JSONB Column on `ad_creatives`

**What people do:** Store analysis as a JSONB blob on the `ad_creatives` table (like `inspiration_posts.analysis`).
**Why it's wrong:** The existing pattern uses `analysis` JSONB on `inspiration_posts` and it causes friction — the frontend has to parse JSON inside JSON, as seen in `Inspiracao/index.tsx` lines 82-84 where `typeof p.analysis === "string"` checks are needed. A separate normalized `ad_analyses` table avoids this.
**Do this instead:** Separate `ad_analyses` table with typed columns. Frontend queries with `.select("*, ad_analyses(*)")` join. No JSON parsing in the UI.

### Anti-Pattern 4: Blocking Webhook While Processing

**What people do:** Process ads synchronously in the webhook handler, causing Apify to time out waiting for a response.
**Why it's wrong:** Apify webhook expects a fast 200 response. Processing a full dataset with Whisper + Claude takes minutes.
**Do this instead:** Same pattern as all existing webhooks — `background_tasks.add_task(process_ads, body)` then immediately return 200.

---

## Scaling Considerations

This is an internal tool for a small marketing team. Scaling is not the primary concern. The only practical concern is API cost and rate limits.

| Concern | Mitigation |
|---------|------------|
| Groq Whisper rate limit (free tier) | Process ads sequentially (not parallel) within the flow — same as existing videos flow |
| Claude API cost per ad | Set max_tokens conservatively in `CLAUDE_MODEL_ADS` calls; ad analyses need less output than content creation |
| Apify actor cost | Facebook Ad Library actor is cheaper than Instagram scraper; collection is on-demand, not scheduled initially |
| Supabase storage | `raw_apify_data jsonb` can be large; consider only storing essential fields and dropping raw data after analysis |

---

## Sources

- Direct inspection of `Fluxos em Python/main.py`, `utils.py`, `prompts.py`, `config.py`
- Direct inspection of `flows/videos.py`, `flows/estaticos.py`, `flows/carrossel.py`
- Direct inspection of `frontend/src/pages/Inspiracao/index.tsx`, `App.tsx`, `Layout.tsx`
- Direct inspection of `supabase/migrations/00_full_schema.sql` for existing table patterns
- Direct inspection of `frontend/src/integrations/supabase/types.ts` for type conventions

---
*Architecture research for: Ad Intelligence Pipeline integration into Criativos*
*Researched: 2026-03-26*
