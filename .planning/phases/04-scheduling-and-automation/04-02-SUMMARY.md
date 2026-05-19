---
phase: 04-scheduling-and-automation
plan: 02
subsystem: frontend
tags: [badge, localStorage, supabase, react-hook, ux]
dependency_graph:
  requires: []
  provides: [useNewAdsCount hook, sidebar badge, tab badge]
  affects: [frontend/src/components/Layout.tsx, frontend/src/pages/AdIntelligence/index.tsx]
tech_stack:
  added: []
  patterns: [localStorage persistence, Supabase count query with head:true, interval polling]
key_files:
  created:
    - frontend/src/hooks/useNewAdsCount.ts
  modified:
    - frontend/src/components/Layout.tsx
    - frontend/src/pages/AdIntelligence/index.tsx
decisions:
  - useNewAdsCount polls every 60s via setInterval — avoids Supabase Realtime subscription cost
  - markVisited sets timestamp on mount, not on unmount — ensures timestamp reflects actual page view time
  - Badge count stays visible on sidebar even after visiting page until next 60s poll cycle
metrics:
  duration: 8m
  completed: "2026-03-26"
  tasks_completed: 2
  files_modified: 3
---

# Phase 04 Plan 02: New Ads Badge Summary

Numeric badge on sidebar Ad Intelligence link and Anuncios tab using localStorage timestamp and Supabase count query — user sees new-since-last-visit count without opening the page.

## What Was Built

### Task 1: useNewAdsCount hook and Layout sidebar badge

- Created `frontend/src/hooks/useNewAdsCount.ts` with three exports:
  - `getLastVisited()` — reads `ad_intelligence_last_visited` ISO timestamp from localStorage
  - `markVisited()` — writes current ISO timestamp to localStorage
  - `useNewAdsCount()` — React hook querying `ad_creatives` count where `collected_at > lastVisited`, polling every 60 seconds
- Updated `frontend/src/components/Layout.tsx`:
  - Added `import { useNewAdsCount }` and called the hook
  - Rendered gradient badge span next to "Ad Intelligence" label when `newAdsCount > 0`

**Commit:** `4d0197b`

### Task 2: Tab badge and markVisited reset on AdIntelligence page

- Updated `frontend/src/pages/AdIntelligence/index.tsx`:
  - Added `import { useNewAdsCount, markVisited }`
  - Added `useEffect(() => { markVisited(); }, [])` on mount to reset badge timestamp
  - Added badge span on Anuncios tab button with conditional styling (white/purple when active, gradient when inactive)

**Commit:** `94b4e45`

## Verification Results

- `npx tsc --noEmit` exits 0
- `grep -c "useNewAdsCount" frontend/src/components/Layout.tsx` returns 2
- `grep -c "markVisited" frontend/src/pages/AdIntelligence/index.tsx` returns 2
- `grep -c "ad_intelligence_last_visited" frontend/src/hooks/useNewAdsCount.ts` returns 1

## Deviations from Plan

None — plan executed exactly as written. The worktree required a merge from main to obtain existing AdIntelligence page files created in Phase 03, which was handled automatically.

## Known Stubs

None — hook queries live Supabase data. Badge count reflects real ad_creatives rows. No placeholders.

## Self-Check: PASSED
