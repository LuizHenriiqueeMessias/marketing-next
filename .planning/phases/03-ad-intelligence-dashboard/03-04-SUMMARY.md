---
phase: 03-ad-intelligence-dashboard
plan: "04"
subsystem: frontend
tags: [ad-intelligence, detail-page, two-column-layout, ai-analysis, supabase]
dependency_graph:
  requires: ["03-01"]
  provides: ["AdDetailPage at /ad-intelligence/:id"]
  affects: ["frontend routing", "ad_creatives query by ID"]
tech_stack:
  added: []
  patterns: ["useParams route param", "Supabase single() query with joins", "ReactMarkdown rendering", "independent column scroll"]
key_files:
  created: []
  modified:
    - frontend/src/pages/AdIntelligence/AdDetailPage.tsx
decisions:
  - "ScoreBar and AnalysisCard defined inline in AdDetailPage (not extracted to shared files) — consistent with plan spec"
  - "Transcription section omitted entirely when transcricao is null/empty — matches UI-SPEC requirement"
  - "Em dash fallback for all null analysis fields — satisfies UI-05 requirement"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-03-26"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 1
---

# Phase 03 Plan 04: Ad Detail Page Summary

Two-column ad detail page with media rendering and full AI analysis breakdown at /ad-intelligence/:id.

## What Was Built

**AdDetailPage.tsx** — Full implementation replacing the placeholder. Loads a single ad by ID from Supabase with full joins (`ad_competitors`, `ad_analyses`). Renders a two-column layout with independent scroll areas.

**Left column (Creative + Copy):**
- Video with controls rendered inline if `storage_video_path` exists and `creative_type` includes "video"
- Full-width image if `storage_image_path` exists
- Gray placeholder with appropriate icon (Video or Image) when neither path is present
- `supabaseStorageUrl()` helper builds public storage URL from env variable
- Body text (full, not truncated) with em dash fallback
- CTA type badge (conditional, only if `cta_type` present)
- "Ver anuncio original" link with ExternalLink icon (conditional)
- Transcription section **only** when `transcricao` is truthy — hidden entirely otherwise

**Right column (AI Analysis):**
- ScoreBar centered at top with 24px margin
- `needs_reanalysis` badge (`badge-status-error`, "Analise incompleta") shown conditionally
- 5 AnalysisCards with lucide icons:
  - Gancho (Sparkles): `hook_text` + `hook_type` badge
  - Angulo (TrendingUp): `angle_tag` as badge
  - CTA (FileText): `cta_analysis` text
  - Estrutura (Hash): `structure_summary` text
  - Insights (Lightbulb): `insights` rendered via ReactMarkdown

**Page header (sticky):**
- Back button (32×32px, `icon-btn` class) with `aria-label="Voltar para Ad Intelligence"`
- Competitor name, format badge
- Start date + status badge on second line

**States:**
- Loading: centered Loader2 spinner
- Not found: centered error message + back button

## Acceptance Criteria

All 16 criteria verified:
- useParams, ad_creatives, ad_competitors, ad_analyses — PASS
- "Voltar para Ad Intelligence" aria-label — PASS
- 100vh independent scroll — PASS
- transcricao conditional section — PASS
- needs_reanalysis badge — PASS
- ReactMarkdown for insights — PASS
- storage_video_path / storage_image_path — PASS
- AnalysisCard / ScoreBar — PASS
- Gancho / hook_text — PASS
- Angulo / angle_tag — PASS
- Em dash fallback — PASS

## Verification

- `npx tsc --noEmit`: 0 errors
- `npm run build`: SUCCESS (2444 modules transformed)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — AdDetailPage reads live data from Supabase and renders all fields. No hardcoded or mock data.

## Self-Check: PASSED

- AdDetailPage.tsx: FOUND
- Commit 3e41c8d: FOUND
