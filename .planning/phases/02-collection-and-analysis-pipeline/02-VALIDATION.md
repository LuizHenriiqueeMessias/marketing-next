---
phase: 2
slug: collection-and-analysis-pipeline
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python import checks + signature assertions |
| **Config file** | none needed |
| **Quick run command** | `cd "Fluxos em Python" && python -c "from flows.ad_intelligence import trigger_collection, process_ad_intelligence_webhook; print('OK')"` |
| **Full suite command** | Run all `<automated>` verify commands from each task sequentially |
| **Estimated runtime** | ~5 seconds |

**Rationale:** This is a backend pipeline phase where production code calls external services (Apify, Groq, Claude, Supabase Storage). Meaningful unit tests would require mocking every external call. Import checks and signature assertions verify that modules are correctly wired, functions exist with expected parameters, and no syntax/import errors exist. This matches the actual `<automated>` verify commands in each plan task.

---

## Sampling Rate

- **After every task commit:** Run that task's `<automated>` verify command
- **After every plan wave:** Run all `<automated>` commands from that wave's plans
- **Before `/gsd:verify-work`:** All `<automated>` commands must pass green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| T1 | 02-01 | 1 | ANA-01, ANA-02, ANA-03, ANA-04 | import+sig | `cd "Fluxos em Python" && python -c "from utils import _transcribe_groq, call_claude, parse_with_retry, upload_to_storage; print('OK')" && python -c "from flows.videos import process_videos; print('OK')" && python -c "import inspect; from utils import call_claude; sig = inspect.signature(call_claude); assert 'image_url' in sig.parameters; print('OK')"` | pending |
| T2 | 02-01 | 1 | COL-01, COL-02 | import | `cd "Fluxos em Python" && python -c "from config import CLAUDE_MODEL_ADS, BACKEND_URL, FACEBOOK_ADS_ACTOR_ID; print('OK')" && python -c "from prompts import AD_ANALYSIS_SYSTEM, SYSTEM_MASTER; assert 'gancho' in AD_ANALYSIS_SYSTEM; print('OK')"` | pending |
| T1 | 02-02 | 2 | COL-03, ANA-01, ANA-02, ANA-03, ANA-04 | import+sig | `cd "Fluxos em Python" && python -c "from flows.ad_intelligence import trigger_collection, process_ad_intelligence_webhook, _process_single_ad; print('OK')" && python -c "import inspect; from flows.ad_intelligence import trigger_collection; sig = inspect.signature(trigger_collection); assert 'competitor_id' in sig.parameters; assert 'page_id' in sig.parameters; print('OK')"` | pending |
| T2 | 02-02 | 2 | COL-03 | import+route | `cd "Fluxos em Python" && python -c "from main import app; routes = [r.path for r in app.routes]; assert '/ad-intelligence/collect' in routes; assert '/webhook/ad-intelligence' in routes; assert '/health' in routes; print('OK')"` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

None — import checks require no test infrastructure beyond Python itself.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apify actor triggers real scrape | COL-03 | Requires real Apify API call | Trigger POST /ad-intelligence/collect with real page_id, verify run appears in Apify console |
| Groq Whisper transcribes real video | ANA-01 | Requires real Groq API call | Process a video ad with audio, verify transcription text is PT-BR |
| Claude Vision analyzes real ad image | ANA-02 | Requires real Anthropic API call | Process an image ad, verify ad_analyses row has gancho, score, etc. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No Wave 0 dependencies (import checks are self-contained)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
