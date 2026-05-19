---
phase: 04-scheduling-and-automation
plan: 01
subsystem: infra
tags: [apscheduler, fastapi, lifespan, cron, scheduler, python, supabase]

# Dependency graph
requires:
  - phase: 02-collection-and-analysis-pipeline
    provides: trigger_collection function and process_ad_intelligence_webhook in flows/ad_intelligence.py
  - phase: 01-database-foundation
    provides: ad_competitors table in Supabase
provides:
  - Weekly APScheduler cron job (Monday 11:00 UTC) that auto-collects ads for active competitors
  - Dedup guard: skips competitors collected less than 6 days ago (last_collected_at check)
  - last_collected_at column on ad_competitors updated after each successful collection
  - FastAPI lifespan context manager replacing deprecated on_event pattern
affects: [04-scheduling-and-automation, 02-collection-and-analysis-pipeline]

# Tech tracking
tech-stack:
  added: [apscheduler==3.10.4]
  patterns: [AsyncIOScheduler on FastAPI event loop, deferred circular import for flows.ad_intelligence, lifespan context manager]

key-files:
  created:
    - Fluxos em Python/scheduler.py
    - Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_competitors_last_collected.sql
  modified:
    - Fluxos em Python/main.py
    - Fluxos em Python/flows/ad_intelligence.py
    - Fluxos em Python/requirements.txt
    - Fluxos em Python/config.py

key-decisions:
  - "AsyncIOScheduler (not BackgroundScheduler) used — runs on FastAPI event loop, no separate thread"
  - "Deferred import of trigger_collection inside _run_weekly_collection to avoid circular dependency"
  - "Jobs stored in memory only (no DB jobstore) — rebuilt on each startup per D-08"
  - "last_collected_at updated after collection run marked done, not before — ensures accurate tracking"

patterns-established:
  - "Circular import avoidance: import flows.ad_intelligence inside async function body, not at module level"
  - "Scheduler lifecycle: start in lifespan startup, shutdown(wait=False) in lifespan teardown"

requirements-completed: [COL-04]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 4 Plan 1: Scheduling and Automation Summary

**APScheduler weekly cron (Monday 11:00 UTC) auto-collects ads for active competitors with 6-day dedup guard and last_collected_at tracking via FastAPI lifespan**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T17:22:04Z
- **Completed:** 2026-03-26T17:26:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `scheduler.py` with `start_scheduler`/`shutdown_scheduler` exports and weekly `_run_weekly_collection` job
- Added migration `20260326_ad_competitors_last_collected.sql` adding `last_collected_at timestamptz` to `ad_competitors`
- Wired scheduler into FastAPI via `lifespan` context manager (replaces deprecated `@app.on_event`)
- `process_ad_intelligence_webhook` now PATCHes `last_collected_at` on `ad_competitors` after successful collection run

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration, config, and scheduler module** - `74bad7d` (feat)
2. **Task 2: Wire scheduler into FastAPI lifespan and update last_collected_at** - `71b8288` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `Fluxos em Python/scheduler.py` - APScheduler module with weekly cron, dedup logic, start/shutdown
- `Fluxos em Python/criativos-standalone/supabase/migrations/20260326_ad_competitors_last_collected.sql` - ALTER TABLE adds last_collected_at
- `Fluxos em Python/requirements.txt` - Added apscheduler==3.10.4
- `Fluxos em Python/config.py` - Added SCHEDULER_CRON_DAY_OF_WEEK/HOUR/MINUTE/MIN_INTERVAL_DAYS constants
- `Fluxos em Python/main.py` - Added asynccontextmanager lifespan with scheduler start/shutdown
- `Fluxos em Python/flows/ad_intelligence.py` - Added PATCH to update last_collected_at after done

## Decisions Made
- AsyncIOScheduler chosen over BackgroundScheduler — runs on FastAPI's event loop, no separate thread contention
- Circular import (scheduler -> flows.ad_intelligence -> scheduler chain) avoided via deferred import inside `_run_weekly_collection` body
- Jobs in memory only (no persistent jobstore) — simplest approach, jobs rebuilt on each restart per D-08
- `last_collected_at` updated after `status="done"` PATCH, not before — ensures accurate tracking even if update fails

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. All verifications passed on first attempt.

## User Setup Required
None - no external service configuration required. Scheduler starts automatically with FastAPI boot.

## Next Phase Readiness
- Phase 4 Plan 1 complete — scheduler operational, last_collected_at tracking in place
- Ready for Plan 02 (Ad Intelligence UI enhancements or next automation task)
- Migration `20260326_ad_competitors_last_collected.sql` must be run in Supabase before deploying updated backend

---
*Phase: 04-scheduling-and-automation*
*Completed: 2026-03-26*
