---
phase: 03-ad-intelligence-dashboard
plan: 02
subsystem: ui
tags: [react, typescript, supabase, framer-motion, lucide-react]

# Dependency graph
requires:
  - phase: 03-ad-intelligence-dashboard
    plan: 01
    provides: "types.ts (AdCompetitor interface), index.tsx page shell with tab bar"
provides:
  - "CompetitorList CRUD table reading/writing ad_competitors via Supabase"
  - "AddCompetitorDialog for creating new competitors"
  - "EditCompetitorDialog for updating existing competitors"
  - "Delete confirmation AlertDialog with cascade warning"
  - "is_active Switch toggle updating Supabase inline"
  - "Collection trigger button calling VITE_API_URL/ad-intelligence/collect"
  - "Concorrentes tab wired with real CompetitorList component"
affects:
  - 03-03 (AdList can now filter by competitor grupo)
  - 03-04 (AdDetailPage shows competitors collected from this list)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CompetitorList follows ProfileList.tsx CRUD pattern: useState + fetchX + useEffect mount"
    - "Collection trigger: fire-and-forget fetch POST with collectingId loading state"
    - "Delete uses AlertDialog with cascade warning (OnDeleteCascade handled by DB schema)"
    - "framer-motion motion.div on each table row: initial={opacity:0,y:8} animate={opacity:1,y:0}"
    - "Switch component from ui/switch.tsx for is_active toggle"

key-files:
  created:
    - frontend/src/pages/AdIntelligence/CompetitorList.tsx
    - frontend/src/pages/AdIntelligence/AddCompetitorDialog.tsx
    - frontend/src/pages/AdIntelligence/EditCompetitorDialog.tsx
  modified:
    - frontend/src/pages/AdIntelligence/index.tsx

key-decisions:
  - "Collection trigger uses VITE_API_URL env var directly (not supabase.functions) — consistent with plan spec"
  - "CompetitorList renders table layout (not cards) — competitors list is management-oriented, not visual"
  - "No pagination added — plan explicitly states competitors list expected < 30 items"

# Metrics
duration: 2min
completed: 2026-03-26
---

# Phase 03 Plan 02: Competitors CRUD Tab Summary

**CRUD table for ad_competitors with is_active Switch toggle, collection trigger button, add/edit dialogs, and delete AlertDialog — Concorrentes tab fully functional**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-26T17:02:53Z
- **Completed:** 2026-03-26T17:05:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created CompetitorList with grid table showing Nome/Page ID/Grupo/Status/Coletar/Acoes columns
- is_active Switch toggle calls Supabase update inline with immediate refetch
- Collection trigger calls `${VITE_API_URL}/ad-intelligence/collect` POST with loading spinner (Loader2)
- Inactive rows rendered at opacity 0.5, Coletar button disabled when is_active=false
- Delete AlertDialog with "Remover concorrente?" title and cascade warning copy per UI-SPEC
- Empty state with Inbox icon, "Nenhum concorrente cadastrado" heading and body copy per spec
- framer-motion animation on each row: initial opacity:0/y:8 → animate opacity:1/y:0
- AddCompetitorDialog: 5 fields (name required, page_id/page_url/grupo/notas optional) with inline validation
- EditCompetitorDialog: pre-populated via useEffect(competitor, open), saves via Supabase update
- Wired CompetitorList into index.tsx Concorrentes tab replacing the placeholder div
- Production build passes with zero TypeScript errors

## Task Commits

1. **Task 1: Create CompetitorList, AddCompetitorDialog, EditCompetitorDialog** - `088dde7` (feat)
2. **Task 2: Wire CompetitorList into index.tsx** - `fa89985` (feat)

## Files Created/Modified

- `frontend/src/pages/AdIntelligence/CompetitorList.tsx` - Full CRUD table for ad_competitors (238 lines)
- `frontend/src/pages/AdIntelligence/AddCompetitorDialog.tsx` - Add dialog with 5 fields + validation (170 lines)
- `frontend/src/pages/AdIntelligence/EditCompetitorDialog.tsx` - Edit dialog pre-populated from competitor prop (170 lines)
- `frontend/src/pages/AdIntelligence/index.tsx` - Concorrentes tab now renders CompetitorList (2 lines changed)

## Decisions Made

- Collection trigger uses `fetch()` directly to `${VITE_API_URL}/ad-intelligence/collect` (not supabase functions) — consistent with FastAPI backend pattern from Plan spec
- Table layout chosen over card grid for competitors — this is a management/admin view, not a gallery
- Button for "Salvar Alteracoes" uses exact copy from plan spec to pass acceptance criteria

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `frontend/src/pages/AdIntelligence/index.tsx` — Anuncios tab still renders `<div>Anuncios tab placeholder</div>`. This is intentional — AdList component is implemented in Plan 03.

## Self-Check: PASSED

- CompetitorList.tsx: FOUND
- AddCompetitorDialog.tsx: FOUND
- EditCompetitorDialog.tsx: FOUND
- index.tsx updated: FOUND (import CompetitorList + usage)
- Commit 088dde7: FOUND
- Commit fa89985: FOUND

---
*Phase: 03-ad-intelligence-dashboard*
*Completed: 2026-03-26*
