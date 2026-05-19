---
plan: "02-02"
phase: 02-collection-and-analysis-pipeline
status: complete
started: 2026-03-26
completed: 2026-03-26
---

# Plan 02-02: Collection Flow + Endpoints — Summary

## What Was Built

Complete ad intelligence pipeline with 2 new API endpoints:

1. **POST /ad-intelligence/collect** — Accepts `competitor_id` + `page_id`, validates input, triggers Apify actor with ad-hoc webhook in background, returns immediately
2. **POST /webhook/ad-intelligence** — Receives Apify callback, processes dataset in background

The pipeline flow in `flows/ad_intelligence.py`:
- Creates collection_run record (status tracking)
- Triggers Apify facebook-ads-scraper with base64-encoded webhook config
- On callback: fetches dataset, detects empty datasets as failures
- Per ad: downloads media to Supabase Storage, transcribes video audio (Groq Whisper, skips >25MB), analyzes with Claude Vision (single call with image + copy), persists to ad_creatives and ad_analyses
- Per-ad failures don't stop the batch (try/except per item)
- JSON parse retry (3 attempts) with needs_reanalysis flag

## Key Files

### Created
- `Fluxos em Python/flows/ad_intelligence.py` — Full pipeline module (374 lines)

### Modified
- `Fluxos em Python/main.py` — 2 new routes added, all existing routes preserved

## Decisions Honored

- D-05: Apify trigger with webhook callback
- D-06: Media download during webhook processing
- D-07: Competitor CRUD via Supabase RLS (no FastAPI endpoints)
- D-09: Single Claude call with image + copy
- D-10: Thumbnail + transcription for videos
- D-12: Per-ad try/except (batch continues)
- D-13: Status + counters tracking in ad_collection_runs
- D-14: 25MB skip with transcription_skipped

## Deviations

None.

## Self-Check: PASSED

- `flows/ad_intelligence.py` imports OK
- `trigger_collection` has correct signature (competitor_id, page_id)
- All 5 routes present in main.py (/health, /webhook/estaticos, /webhook/carrossel, /webhook/videos, /ad-intelligence/collect, /webhook/ad-intelligence)
- Empty dataset detection present
- MAX_GROQ_BYTES check present
- parse_with_retry called with max_attempts=3
- needs_reanalysis mapped to ad_analyses
