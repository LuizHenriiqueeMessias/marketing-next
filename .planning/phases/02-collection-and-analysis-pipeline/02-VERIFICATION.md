---
phase: 02-collection-and-analysis-pipeline
verified: 2026-03-26T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Trigger full collection cycle end-to-end"
    expected: "POST /ad-intelligence/collect returns 200 immediately, Apify run starts, webhook fires, ads are persisted to ad_creatives and ad_analyses"
    why_human: "Requires live Apify credentials, deployed BACKEND_URL, and Facebook Ad Library data — cannot verify programmatically without external services"
  - test: "25MB video skip behavior"
    expected: "Video above 25MB is stored in Storage but transcription is skipped; analysis proceeds using thumbnail + copy only; ad_creatives.transcricao is null"
    why_human: "Requires actual oversized video file and live Supabase Storage — cannot simulate in static verification"
  - test: "JSON parse retry exhaustion"
    expected: "After 3 failed Claude calls, ad_analyses.needs_reanalysis = true and ad is still persisted (not dropped)"
    why_human: "Requires mocking Claude to return invalid JSON 3 times — cannot verify without running the pipeline"
---

# Phase 02: Collection and Analysis Pipeline — Verification Report

**Phase Goal:** Backend processa um ciclo completo: usuário dispara coleta, Apify scrapes o Facebook Ad Library, áudio é transcrito, imagens analisadas visualmente, Claude gera análise JSON estruturada — tudo persiste sem corromper dados
**Verified:** 2026-03-26
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `_transcribe_groq` is importable from `utils.py` and no longer defined in `flows/videos.py` | ✓ VERIFIED | Defined at utils.py:44; videos.py imports it from utils (line 20) — no local definition |
| 2  | `call_claude` accepts optional `image_url` and sends content blocks when provided | ✓ VERIFIED | utils.py:178 signature has `image_url: str = ""`; lines 196-202 build image content blocks |
| 3  | `parse_with_retry` calls Claude up to 3 times and returns `needs_reanalysis=True` after exhaustion | ✓ VERIFIED | utils.py:233-252 — loop `range(1, max_attempts + 1)`, returns `(dict, True)` after loop ends |
| 4  | `upload_to_storage` uploads bytes to Supabase Storage `ad-media` bucket and returns storage path | ✓ VERIFIED | utils.py:152-167 — posts to `/storage/v1/object/ad-media/{storage_path}`, returns `storage_path` |
| 5  | `AD_ANALYSIS_SYSTEM` prompt exists in `prompts.py` with all 8 fields in Portuguese | ✓ VERIFIED | prompts.py:434-481 — contains gancho, tipo_gancho, angulo, tag_angulo, cta, estrutura, score, insights |
| 6  | `BACKEND_URL` and `CLAUDE_MODEL_ADS` constants exist in `config.py` | ✓ VERIFIED | config.py:51-52 — both present in Ad Intelligence section |
| 7  | COL-01/COL-02 are handled via Supabase RLS direct (no FastAPI endpoint needed per D-07) | ✓ VERIFIED | No `/ad-competitors` endpoint in main.py; plan documents the D-07 decision explicitly |
| 8  | POST `/ad-intelligence/collect` accepts competitor_id + page_id, creates collection_run, triggers Apify with ad-hoc webhook, returns immediately | ✓ VERIFIED | main.py:106-129; ad_intelligence.py:65-116 — validates input, background task, Apify trigger with webhooks_b64 |
| 9  | POST `/webhook/ad-intelligence` receives Apify callback, downloads media to Storage, transcribes, analyzes with Claude Vision, persists to ad_creatives and ad_analyses | ✓ VERIFIED | ad_intelligence.py:279-374 — full pipeline in `process_ad_intelligence_webhook` and `_process_single_ad` |
| 10 | Empty Apify dataset is detected and collection_run marked as failed | ✓ VERIFIED | ad_intelligence.py:320-331 — `if not items:` sets status="failed", ads_found=0 |
| 11 | Individual ad failures do not stop the batch (per D-12) | ✓ VERIFIED | ad_intelligence.py:346-356 — `except Exception as e:` inside for-loop, increments `failed` counter and continues |
| 12 | Videos above 25MB are flagged `transcription_skipped` and analysis proceeds with thumbnail + copy only (per D-14) | ✓ VERIFIED | ad_intelligence.py:194-205 — `MAX_GROQ_BYTES = 25 * 1024 * 1024`; size check sets `transcription_skipped = True` |

**Score: 12/12 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Fluxos em Python/utils.py` | `_transcribe_groq`, `call_claude` with vision, `parse_with_retry`, `upload_to_storage` | ✓ VERIFIED | All 4 functions present and substantive |
| `Fluxos em Python/prompts.py` | `AD_ANALYSIS_SYSTEM` prompt | ✓ VERIFIED | Present at line 434 with all 8 PT-BR fields |
| `Fluxos em Python/config.py` | `BACKEND_URL`, `CLAUDE_MODEL_ADS`, `FACEBOOK_ADS_ACTOR_ID` | ✓ VERIFIED | All 3 constants present (lines 51-53) |
| `Fluxos em Python/flows/ad_intelligence.py` | `trigger_collection`, `process_ad_intelligence_webhook` | ✓ VERIFIED | 375-line substantive implementation |
| `Fluxos em Python/main.py` | POST `/ad-intelligence/collect`, POST `/webhook/ad-intelligence` | ✓ VERIFIED | Both routes present; all 5 existing routes preserved |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `flows/videos.py` | `utils.py` | `from utils import (_client, _transcribe_groq, ...)` | ✓ WIRED | videos.py line 18-31 imports `_transcribe_groq` from utils; not defined locally |
| `utils.py` | Anthropic API | `call_claude` image content blocks | ✓ WIRED | utils.py lines 196-202 — `{"type": "image", "source": {"type": "url", "url": image_url}}` |
| `main.py` | `flows/ad_intelligence.py` | `from flows.ad_intelligence import` + `BackgroundTasks.add_task` | ✓ WIRED | main.py line 22 imports both; lines 128, 145 schedule as background tasks |
| `flows/ad_intelligence.py` | `utils.py` | `parse_with_retry` import and call | ✓ WIRED | ad_intelligence.py line 30 imports; line 248 calls `await parse_with_retry(...)` |
| `flows/ad_intelligence.py` | Supabase `ad_creatives` + `ad_analyses` | `supabase_post` calls | ✓ WIRED | Lines 229 (`ad_creatives`) and 271 (`ad_analyses`) |
| `flows/ad_intelligence.py` | Apify API | `trigger_apify_collection` with ad-hoc webhook | ✓ WIRED | Line 90 — `webhooks_b64 = base64.b64encode(...)`; line 99-105 POST to Apify runs endpoint |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `flows/ad_intelligence.py` (`_process_single_ad`) | `creative_result["id"]` → `creative_id` | `supabase_post("ad_creatives", creative_data)` | Returns Supabase-created row with `id` | ✓ FLOWING |
| `flows/ad_intelligence.py` (`process_ad_intelligence_webhook`) | `items` | `fetch_apify_dataset(dataset_id)` | Fetches live dataset from Apify API | ✓ FLOWING |
| `flows/ad_intelligence.py` (`_process_single_ad`) | `analysis_result` | `parse_with_retry(...)` → `call_claude(...)` → Anthropic API | Live Claude Vision call with image + copy | ✓ FLOWING |
| `flows/ad_intelligence.py` (`_process_single_ad`) | `transcricao` | `_transcribe_groq(video_bytes)` → Groq Whisper API | Live transcription of video bytes | ✓ FLOWING |

---

### Behavioral Spot-Checks

Python runtime unavailable in this environment (Microsoft Store alias). Checks performed by static code analysis instead.

| Behavior | Method | Result | Status |
|----------|--------|--------|--------|
| `call_claude` image_url param exists and builds content blocks | Read utils.py lines 172-221 | `image_url: str = ""` present; lines 196-202 build `[{type: image}, {type: text}]` block | ✓ PASS |
| `parse_with_retry` loops exactly 3 times and returns `needs_reanalysis=True` | Read utils.py lines 244-252 | `range(1, max_attempts + 1)` with default 3; returns `(dict, True)` after exhaustion | ✓ PASS |
| Empty dataset marks run as failed | Read ad_intelligence.py lines 319-331 | `if not items:` → `status="failed"`, `ads_found=0`, early return | ✓ PASS |
| Per-ad try/except isolates failures | Read ad_intelligence.py lines 346-356 | `try/except Exception` wraps `_process_single_ad`, increments `failed` and continues | ✓ PASS |
| `needs_reanalysis` persisted to ad_analyses | Read ad_intelligence.py lines 257-272 | `"needs_reanalysis": needs_reanalysis` in `analysis_data` dict | ✓ PASS |
| All existing routes preserved in main.py | Read main.py lines 43-102 | `/health`, `/webhook/estaticos`, `/webhook/carrossel`, `/webhook/videos` all present | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COL-01 | 02-01, 02-02 | Usuário pode adicionar página de concorrente (nome + page_id do Facebook) | ✓ SATISFIED (via D-07) | Frontend writes directly to `ad_competitors` via Supabase RLS — no backend endpoint needed per decision D-07. Phase 1 created the table + RLS policies. |
| COL-02 | 02-01, 02-02 | Usuário pode remover página de concorrente do monitoramento | ✓ SATISFIED (via D-07) | Same D-07 decision — frontend DELETE via RLS direct. Table + RLS from Phase 1. |
| COL-03 | 02-02 | Usuário pode disparar coleta manual via Apify | ✓ SATISFIED | `POST /ad-intelligence/collect` in main.py; `trigger_collection` fires Apify actor with webhook |
| ANA-01 | 02-01, 02-02 | Sistema transcreve áudio de vídeos via Groq Whisper (PT-BR) | ✓ SATISFIED | `_transcribe_groq` in utils.py; called in `_process_single_ad` with `language: "pt"` |
| ANA-02 | 02-01, 02-02 | Sistema analisa imagens via Claude Vision (OCR + descrição visual) | ✓ SATISFIED | `call_claude` extended with `image_url`; `parse_with_retry` called with `image_url=media_url_for_vision` |
| ANA-03 | 02-01, 02-02 | Sistema analisa copy com Claude retornando JSON estruturado (hook, hook_type, ângulo, angle_tag, CTA, estrutura, score 1-10) | ✓ SATISFIED | `AD_ANALYSIS_SYSTEM` prompt with all 8 fields; fields mapped to `ad_analyses` columns |
| ANA-04 | 02-01, 02-02 | Sistema valida JSON e faz retry em caso de falha de parsing | ✓ SATISFIED | `parse_with_retry` in utils.py — up to 3 attempts, `needs_reanalysis=True` on exhaustion |

**Orphaned Requirements Check:** Requirements COL-04, COL-05 are mapped to Phase 4 — not orphaned for this phase. All Phase 2 requirements (COL-01, COL-02, COL-03, ANA-01, ANA-02, ANA-03, ANA-04) are claimed and verified.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `flows/ad_intelligence.py` | 514 (plan only) | `final_status = "done" if failed == 0 else "done"` (tautology) | ℹ️ Info | In the **actual committed code** (line 366-372) the tautology was cleaned — status is always "done" unconditionally. Both branches of an original tautology were collapsed to `status="done"`. Not a stub, just semantically odd. The plan's `# done even with partial failures — ads_processed shows count` comment explains the intent. No functional impact. |
| `flows/ad_intelligence.py` | 26-33 | `supabase_get` not imported but was listed in plan interfaces | ℹ️ Info | Not a defect — `supabase_get` is never needed in the write-only pipeline. Actual code only imports `supabase_post`. |

No blockers or warnings found.

---

### Human Verification Required

#### 1. Full End-to-End Collection Cycle

**Test:** Deploy the FastAPI backend with `BACKEND_URL`, `APIFY_TOKEN`, and `ANTHROPIC_API_KEY` set. Call `POST /ad-intelligence/collect` with a real `competitor_id` UUID and a Facebook `page_id`. Monitor logs and query `ad_collection_runs`, `ad_creatives`, and `ad_analyses` tables after the Apify webhook fires.
**Expected:** `ad_collection_runs` row transitions from `running` → `processing` → `done`; `ad_creatives` rows appear with `storage_image_path` populated; `ad_analyses` rows appear with non-null `hook_text`, `score`, and `needs_reanalysis=false`.
**Why human:** Requires live Apify credentials, publicly reachable BACKEND_URL for webhook callback, and Facebook Ad Library data.

#### 2. 25MB Video Skip Behavior

**Test:** Inject a mock Apify dataset item with a `video_url` pointing to a file > 25MB. Trigger `process_ad_intelligence_webhook` with that item.
**Expected:** `ad_creatives.transcricao` is null, `ad_creatives.file_size_bytes` > 26214400, `ad_analyses` row is still created (analysis proceeds with thumbnail only).
**Why human:** Requires live Supabase Storage and an actual oversized test video.

#### 3. JSON Parse Retry and needs_reanalysis Flag

**Test:** Temporarily patch Claude to return invalid JSON (e.g., mock `call_claude` to return `"not json"` 3 times). Run a single ad through `_process_single_ad`.
**Expected:** `ad_analyses.needs_reanalysis = true`; `ad_analyses.full_analysis` contains `{"error": "parse_failed", ...}`; the ad is still persisted (not dropped).
**Why human:** Requires mocking the Anthropic API response — not possible via static verification.

---

### Gaps Summary

No gaps found. All 12 must-haves from both plans are verified in the actual codebase with substantive implementation (not stubs) and correct wiring. All 7 Phase 2 requirements (COL-01 through COL-03, ANA-01 through ANA-04) have implementation evidence. The phase goal is achieved at the backend code level — the full cycle from user trigger to persisted analysis is implemented.

The three items flagged for human verification are runtime behaviors that require external services and cannot be verified by static analysis. They do not represent missing implementation — all relevant code paths exist and are correctly wired.

---

_Verified: 2026-03-26_
_Verifier: Claude (gsd-verifier)_
