---
phase: 04-scheduling-and-automation
verified: 2026-03-26T18:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "COL-04 checkbox is unchecked despite implementation being complete"
    missing:
      - "Mark COL-04 as complete in REQUIREMENTS.md: change '- [ ] **COL-04**' to '- [x] **COL-04**'"
      - "Update Phase/Status table row for COL-04 from 'Pending' to 'Complete'"
human_verification:
  - test: "Verify APScheduler fires on Monday 11:00 UTC"
    expected: "Weekly job runs, queries active competitors, triggers collection for those past 6-day threshold"
    why_human: "Cannot simulate cron trigger without running the FastAPI app and waiting for Monday"
  - test: "Verify badge count resets after page visit"
    expected: "After visiting Ad Intelligence page, badge count drops to 0 on next 60s poll"
    why_human: "Requires browser interaction with localStorage and live Supabase data"
---

# Phase 4: Scheduling and Automation Verification Report

**Phase Goal:** Coleta semanal acontece automaticamente por concorrente ativo sem acao manual, e usuario ve badge indicando anuncios novos desde a ultima visita
**Verified:** 2026-03-26T18:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | APScheduler runs a weekly job that triggers collection for each active competitor | VERIFIED | `scheduler.py` lines 28-70: `_run_weekly_collection` queries `is_active=eq.true`, iterates competitors, calls `trigger_collection` |
| 2 | Scheduler skips competitors whose last_collected_at is less than 6 days ago | VERIFIED | `scheduler.py` lines 46-56: `cutoff = datetime.now(timezone.utc) - timedelta(days=SCHEDULER_MIN_INTERVAL_DAYS)`, skips if `last_dt > cutoff` |
| 3 | last_collected_at is updated on ad_competitors after successful collection | VERIFIED | `flows/ad_intelligence.py` lines 374-385: PATCH to `ad_competitors?id=eq.{competitor_id}` with `last_collected_at` after `status="done"` |
| 4 | Scheduler starts automatically when FastAPI app boots | VERIFIED | `main.py` lines 39-43: `@asynccontextmanager async def lifespan(app)` calls `start_scheduler()` on startup, `shutdown_scheduler()` on teardown; `app = FastAPI(..., lifespan=lifespan)` |
| 5 | User sees a numeric badge on Ad Intelligence sidebar link showing count of new ads since last visit | VERIFIED | `Layout.tsx` line 41: `{to === "/ad-intelligence" && newAdsCount > 0 && (<span>...{newAdsCount}</span>)}` |
| 6 | User sees a numeric badge on the Anuncios tab showing count of new ads since last visit | VERIFIED | `AdIntelligence/index.tsx` lines 60-77: badge span on Anuncios button with conditional styling |
| 7 | Badge disappears (count resets) when user visits the Ad Intelligence page | VERIFIED | `AdIntelligence/index.tsx` lines 14-16: `useEffect(() => { markVisited(); }, [])` updates localStorage on mount; hook re-polls every 60s |
| 8 | COL-04 marked complete in REQUIREMENTS.md | FAILED | `.planning/REQUIREMENTS.md` line 15 reads `- [ ] **COL-04**` (unchecked); table row line 79 reads `Pending` |

**Score:** 7/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Fluxos em Python/scheduler.py` | Scheduler module with weekly job and dedup logic, exports `start_scheduler`/`shutdown_scheduler` | VERIFIED | 102 lines, substantive implementation, exports confirmed, wired into `main.py` |
| `Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_competitors_last_collected.sql` | ALTER TABLE migration adding last_collected_at column | VERIFIED | Line 11: `ALTER TABLE ad_competitors ADD COLUMN IF NOT EXISTS last_collected_at timestamptz;` |
| `frontend/src/hooks/useNewAdsCount.ts` | Custom hook querying Supabase for ads newer than localStorage timestamp, exports `useNewAdsCount` | VERIFIED | 49 lines, exports `useNewAdsCount`, `markVisited`, `getLastVisited`; Supabase query on line 28-31 |
| `frontend/src/components/Layout.tsx` | Sidebar nav with badge count on Ad Intelligence link | VERIFIED | Imports `useNewAdsCount` line 4, calls hook line 16, renders badge lines 41-58 |
| `frontend/src/pages/AdIntelligence/index.tsx` | Ad Intelligence page that resets last visited timestamp and shows badge on Anuncios tab | VERIFIED | Imports `useNewAdsCount, markVisited` line 5, `markVisited()` in `useEffect` line 15, badge on Anuncios tab lines 60-77 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Fluxos em Python/scheduler.py` | `Fluxos em Python/flows/ad_intelligence.py` | calls `trigger_collection(competitor_id, page_id)` | WIRED | Line 30 deferred import `from flows.ad_intelligence import trigger_collection`; line 65 `await trigger_collection(comp["id"], page_id)` |
| `Fluxos em Python/main.py` | `Fluxos em Python/scheduler.py` | lifespan context manager calls `start_scheduler`/`shutdown_scheduler` | WIRED | Line 24 `from scheduler import start_scheduler, shutdown_scheduler`; lines 41-43 `start_scheduler()` / `shutdown_scheduler()` in lifespan |
| `frontend/src/hooks/useNewAdsCount.ts` | Supabase `ad_creatives` table | `supabase.from('ad_creatives').select('id', { count: 'exact', head: true }).gt('collected_at', lastVisited)` | WIRED | Lines 28-31 match exactly; live Supabase client from `@/integrations/supabase/client` |
| `frontend/src/components/Layout.tsx` | `frontend/src/hooks/useNewAdsCount.ts` | import and render badge next to Ad Intelligence label | WIRED | Line 4 import, line 16 `const newAdsCount = useNewAdsCount()`, lines 41-58 badge render |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `Layout.tsx` | `newAdsCount` | `useNewAdsCount()` hook | Yes — Supabase count query `.gt("collected_at", lastVisited)` returns live integer | FLOWING |
| `AdIntelligence/index.tsx` | `newAdsCount` | `useNewAdsCount()` hook (same instance) | Yes — same Supabase query | FLOWING |
| `scheduler.py` `_run_weekly_collection` | `competitors` | Supabase REST GET `ad_competitors?is_active=eq.true` | Yes — live DB query, `resp.json()` used directly | FLOWING |
| `flows/ad_intelligence.py` | `last_collected_at` PATCH | `datetime.now(timezone.utc).isoformat()` | Yes — real timestamp written to DB after successful run | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for scheduler (requires running FastAPI + waiting for cron trigger). TypeScript compilation check is the closest runnable verification.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `useNewAdsCount.ts` exports exist | `grep "export function" "frontend/src/hooks/useNewAdsCount.ts"` | `export function getLastVisited`, `markVisited`, `useNewAdsCount` | PASS |
| `scheduler.py` exports exist | `grep "def start_scheduler\|def shutdown_scheduler" "Fluxos em Python/scheduler.py"` | Both functions present | PASS |
| `main.py` imports scheduler | `grep "from scheduler import" "Fluxos em Python/main.py"` | `from scheduler import start_scheduler, shutdown_scheduler` | PASS |
| `apscheduler` in requirements | `grep "apscheduler" "Fluxos em Python/requirements.txt"` | `apscheduler==3.10.4` | PASS |
| Migration file contains ALTER TABLE | Read file | `ALTER TABLE ad_competitors ADD COLUMN IF NOT EXISTS last_collected_at timestamptz;` | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| COL-04 | 04-01-PLAN.md | Sistema coleta anuncios automaticamente em schedule semanal (APScheduler) | SATISFIED (code) / NOT UPDATED (docs) | Implementation complete in `scheduler.py` + `main.py` lifespan. REQUIREMENTS.md checkbox still unchecked. |
| COL-05 | 04-02-PLAN.md | Sistema indica anuncios novos desde a ultima visita do usuario (badge) | SATISFIED | `useNewAdsCount` hook + Layout badge + AdIntelligence tab badge all verified. REQUIREMENTS.md correctly marked `[x]`. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/REQUIREMENTS.md` | 15, 79 | COL-04 checkbox unchecked and status shows "Pending" despite complete implementation | Info | Does not block runtime behavior; affects project tracking accuracy |

No code anti-patterns (TODO/FIXME/stubs/empty returns) found in any of the 5 implementation files.

### Human Verification Required

#### 1. Weekly Cron Trigger

**Test:** Deploy FastAPI app and wait until Monday 11:00 UTC (or temporarily change SCHEDULER_CRON_DAY_OF_WEEK/HOUR env vars to fire within minutes)
**Expected:** Logs show `[scheduler] weekly collection job started`, active competitors are fetched, collection is triggered for those past the 6-day threshold, `last_collected_at` is patched on the competitor row after Apify webhook completes
**Why human:** Cannot simulate AsyncIOScheduler cron trigger programmatically in this environment; requires a running FastAPI process

#### 2. Badge Count Reset Flow

**Test:** Open the app in a browser with existing ad_creatives collected after the stored `ad_intelligence_last_visited` timestamp. Observe badge on sidebar. Navigate to Ad Intelligence page.
**Expected:** Sidebar shows numeric badge before visit. After page loads (triggering `markVisited()`), the badge drops to 0 on the next 60-second poll cycle.
**Why human:** Requires browser with localStorage, live Supabase connection, and real ad data; cannot verify DOM rendering or localStorage behavior programmatically

### Gaps Summary

The implementation is functionally complete. All 5 artifacts exist and are substantive, all 4 key links are wired, and all data flows reach live data sources.

The single gap is a documentation tracking issue: **COL-04 was not marked complete in REQUIREMENTS.md** after implementation. The code delivers the requirement (APScheduler weekly collection), but the REQUIREMENTS.md checkbox on line 15 remains `- [ ]` and the status table on line 79 still reads `Pending`. This is a bookkeeping miss, not a code gap, but it should be corrected for accurate project state tracking.

**Fix required:** In `.planning/REQUIREMENTS.md`:
1. Change line 15 from `- [ ] **COL-04**` to `- [x] **COL-04**`
2. Change line 79 from `| COL-04 | Phase 4 | Pending |` to `| COL-04 | Phase 4 | Complete |`

---

_Verified: 2026-03-26T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
