---
plan: "02-01"
phase: 02-collection-and-analysis-pipeline
status: complete
started: 2026-03-26
completed: 2026-03-26
---

# Plan 02-01: Shared Utilities Extension — Summary

## What Was Built

Extended the shared utility layer with all building blocks needed by the ad intelligence pipeline:

1. **_transcribe_groq** — Moved from `flows/videos.py` to `utils.py` for shared use between inspiration and ad flows
2. **call_claude** — Extended with `image_url` parameter for Claude Vision support (backward-compatible)
3. **parse_with_retry** — New function: calls Claude up to 3 times with JSON parsing retry, returns `needs_reanalysis=True` on exhaustion
4. **upload_to_storage** — New function: uploads bytes to Supabase Storage `ad-media` bucket
5. **AD_ANALYSIS_SYSTEM** — New prompt in `prompts.py` with all 8 PT-BR fields, hybrid score criteria, neutral analyst identity
6. **Config constants** — `CLAUDE_MODEL_ADS`, `BACKEND_URL`, `FACEBOOK_ADS_ACTOR_ID` added to `config.py`

## Key Files

### Created
- (no new files)

### Modified
- `Fluxos em Python/utils.py` — 4 new/modified functions
- `Fluxos em Python/flows/videos.py` — Removed _transcribe_groq, imports from utils
- `Fluxos em Python/config.py` — 3 new constants
- `Fluxos em Python/prompts.py` — AD_ANALYSIS_SYSTEM prompt

## Decisions Honored

- D-01: All fields in Portuguese
- D-02: Full structured JSON (8 fields)
- D-03: Hybrid score criteria (ad + inspiration)
- D-04: Neutral analyst identity
- D-08: Claude Vision direct (Anthropic API)
- D-09: Single call with image + copy
- D-11: 3-attempt retry logic

## Deviations

None.

## Self-Check: PASSED

All automated verification commands pass:
- `from utils import _transcribe_groq, call_claude, parse_with_retry, upload_to_storage` — OK
- `from flows.videos import process_videos` — OK (no regression)
- `call_claude` has `image_url` parameter — OK
- `from config import CLAUDE_MODEL_ADS, BACKEND_URL, FACEBOOK_ADS_ACTOR_ID` — OK
- `AD_ANALYSIS_SYSTEM` contains all 8 fields — OK
