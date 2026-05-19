# Phase 2: Collection and Analysis Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 02-collection-and-analysis-pipeline
**Areas discussed:** Ad analysis prompt design, Collection trigger flow, Vision analysis approach, Retry and failure handling

---

## Ad Analysis Prompt Design

### Language

| Option | Description | Selected |
|--------|-------------|----------|
| English field names, PT-BR content | Fields in English, content in Portuguese | |
| All Portuguese | Fields and content all in PT-BR | ✓ |
| You decide | Claude picks best convention | |

**User's choice:** All Portuguese
**Notes:** User also requested all subsequent questions be asked in Portuguese.

### Detail Level

| Option | Description | Selected |
|--------|-------------|----------|
| Full structured (Recommended) | All fields: gancho, tipo_gancho, angulo, tag_angulo, cta, estrutura, score, insights | ✓ |
| Compact core fields | Only: gancho, angulo, cta, score, insights | |
| Match inspiration format | Same shape as SYSTEM_MASTER output | |

**User's choice:** Full structured

### Score Criteria

| Option | Description | Selected |
|--------|-------------|----------|
| Ad-specific criteria | Clareza proposta, qualidade gancho, forca CTA, originalidade | |
| Same as inspiration | Relevancia, potencial engajamento, qualidade raciocinio | |
| You decide | Claude designs scoring criteria | |

**User's choice:** Both 1 and 2 — hybrid combining ad-specific and inspiration criteria.

### Identity

| Option | Description | Selected |
|--------|-------------|----------|
| Analista neutro (Recommended) | Objective analyst, no persona | ✓ |
| Identidade fixa | Fixed persona like SYSTEM_MASTER | |
| Voce decide | Claude chooses | |

**User's choice:** Analista neutro

---

## Collection Trigger Flow

### Endpoint Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Dispara Apify e webhook volta (Recommended) | POST triggers Apify, configures callback webhook | ✓ |
| Dispara Apify e faz polling | POST triggers actor, backend polls status | |
| Voce decide | Claude chooses | |

**User's choice:** Dispara Apify e webhook volta

### Media Download Timing

| Option | Description | Selected |
|--------|-------------|----------|
| No processamento do webhook (Recommended) | Download during webhook processing, URLs still valid | ✓ |
| Job separado apos persistencia | Save data first, download media later | |
| Voce decide | Claude chooses | |

**User's choice:** No processamento do webhook

### CRUD Location

| Option | Description | Selected |
|--------|-------------|----------|
| FastAPI endpoints | POST/DELETE in FastAPI | |
| Supabase direto (Recommended) | Frontend reads/writes Supabase directly via RLS | ✓ |
| Voce decide | Claude chooses | |

**User's choice:** Supabase direto

---

## Vision Analysis Approach

### Vision API

| Option | Description | Selected |
|--------|-------------|----------|
| Claude direto (Recommended) | Anthropic API with vision | ✓ |
| OpenRouter (Haiku) | OpenRouter with claude-haiku-4-5 | |
| Voce decide | Claude chooses | |

**User's choice:** Claude direto

### Call Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Chamada unica (Recommended) | Image + copy in same request | ✓ |
| Chamadas separadas | Separate vision and copy analysis calls | |
| Depende do formato | Single for images, separate for videos | |

**User's choice:** Chamada unica

### Video Analysis

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail + transcricao (Recommended) | Thumbnail as image + Whisper transcription as text | ✓ |
| Multiplos frames + transcricao | Extract 3-5 frames + transcription | |
| Voce decide | Claude chooses | |

**User's choice:** Thumbnail + transcricao

---

## Retry and Failure Handling

### JSON Parse Retries

| Option | Description | Selected |
|--------|-------------|----------|
| 2 retries (Recommended) | 3 total attempts before needs_reanalysis | ✓ |
| 1 retry | 2 total attempts | |
| Voce decide | Claude chooses | |

**User's choice:** 2 retries

### Partial Batch Failure

| Option | Description | Selected |
|--------|-------------|----------|
| Continua o batch (Recommended) | Log error, mark ad, continue processing | ✓ |
| Para o batch inteiro | Any error aborts all processing | |
| Voce decide | Claude chooses | |

**User's choice:** Continua o batch

### Run Tracking Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Status + contadores (Recommended) | Status, total/processed/failed counts, timestamps | ✓ |
| Status + log detalhado | Counters + JSONB log per ad | |
| Voce decide | Claude chooses | |

**User's choice:** Status + contadores

### 25MB Video Limit

| Option | Description | Selected |
|--------|-------------|----------|
| Skip direto (Recommended) | Mark transcription_skipped, continue with visual+copy | ✓ |
| Tentar comprimir | Use ffmpeg to compress audio first | |
| Voce decide | Claude chooses | |

**User's choice:** Skip direto

---

## Claude's Discretion

No areas deferred to Claude — all decisions made by user.

## Deferred Ideas

None — discussion stayed within phase scope.
