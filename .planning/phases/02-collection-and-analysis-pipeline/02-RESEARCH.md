# Phase 2: Collection and Analysis Pipeline - Research

**Researched:** 2026-03-26
**Domain:** FastAPI background tasks, Apify actor trigger + ad-hoc webhooks, Groq Whisper transcription, Anthropic Vision API, Supabase Storage upload, JSON parse retry logic
**Confidence:** HIGH — all key APIs verified against official documentation; Apify facebook-ads-scraper field schema is MEDIUM confidence (documented in open question below)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Campos e conteudo todo em portugues (gancho, tipo_gancho, angulo, tag_angulo, cta, estrutura, score, insights) — consistente com fluxo de inspiracao
- **D-02:** JSON completo com todos os campos do requirement: gancho, tipo_gancho, angulo, tag_angulo, cta, estrutura, score 1-10, insights
- **D-03:** Score combina criterios de ad (clareza, qualidade do gancho, forca do CTA, originalidade) com criterios de inspiracao (relevancia, potencial engajamento, qualidade raciocinio)
- **D-04:** Prompt com identidade de analista neutro — sem persona fixa, foco em extracao objetiva de dados
- **D-05:** POST /ad-intelligence/collect dispara Apify actor via API com webhook de callback configurado. Quando Apify termina, chama endpoint de processamento. Mesmo padrao da inspiracao.
- **D-06:** Download de midia (imagens/videos para Supabase Storage) acontece durante o processamento do webhook — URLs do Facebook expiram em horas
- **D-07:** CRUD de concorrentes (COL-01, COL-02) via Supabase direto com RLS — frontend le/escreve Supabase diretamente, FastAPI so para processamento pesado. Consistente com decisao do STATE.md.
- **D-08:** Claude Vision direto via Anthropic API — sem OpenRouter, sem dependencia extra
- **D-09:** Chamada unica ao Claude: envia imagem + copy no mesmo request, retorna JSON completo. Menos latencia, menos custo, analise mais coerente.
- **D-10:** Para videos: envia thumbnail como imagem + transcricao Whisper como texto. Sem extracao de multiplos frames.
- **D-11:** 2 retries de parsing JSON antes de marcar como needs_reanalysis. Total de 3 tentativas.
- **D-12:** Falha individual em um ad nao para o batch — loga erro, marca ad com status de erro, continua processando proximos. Mesmo padrao do flows/videos.py.
- **D-13:** Tracking em ad_collection_runs: status (pending/processing/done/failed), total_ads, processed_ads, failed_ads, started_at, finished_at. Sem log detalhado por ad.
- **D-14:** Videos acima de 25MB: skip direto, marca transcription_skipped. Analise visual + copy ainda acontece. Sem ffmpeg no servidor.

### Claude's Discretion

Nenhuma area delegada — todas as decisoes foram tomadas pelo usuario.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COL-01 | Usuário pode adicionar página de concorrente (nome + page_id do Facebook) | D-07: Supabase CRUD direto via RLS — no FastAPI endpoint needed; frontend writes ad_competitors table directly |
| COL-02 | Usuário pode remover página de concorrente do monitoramento | D-07: same as COL-01 — Supabase DELETE with RLS |
| COL-03 | Usuário pode disparar coleta manual de anúncios de um concorrente via Apify | D-05: POST /ad-intelligence/collect triggers Apify actor run via API with ad-hoc webhook; returns 200 immediately, processing in background |
| ANA-01 | Sistema transcreve áudio de vídeos de anúncios via Groq Whisper (PT-BR) | _transcribe_groq() moved from flows/videos.py to utils.py; 25MB limit check required before sending; D-14: skip with transcription_skipped flag |
| ANA-02 | Sistema analisa imagens de anúncios via Claude Vision (OCR + descrição visual) | Verified: Anthropic API supports URL-based image source blocks and base64; single call with image + text content per D-09 |
| ANA-03 | Sistema analisa copy com Claude retornando JSON estruturado (hook, hook_type, ângulo, angle_tag, CTA, estrutura, score 1-10) | New AD_ANALYSIS prompt in prompts.py; all fields in PT-BR per D-01/D-02; call_claude() extended to support vision content blocks |
| ANA-04 | Sistema valida JSON de análise e faz retry em caso de falha de parsing | parse_llm_json() extended with retry loop; 3 total attempts (D-11); after exhaustion mark needs_reanalysis=true in ad_analyses |
| INF-04 | Sistema verifica tamanho do vídeo antes de transcrição (limite 25MB do Groq) | Check len(video_bytes) before _transcribe_groq(); mark transcription_skipped if > 25MB; analysis continues per D-14 |
</phase_requirements>

---

## Summary

Phase 2 builds the complete backend processing pipeline for ad intelligence. The user triggers a collection via `POST /ad-intelligence/collect`, which fires an Apify actor run with an ad-hoc webhook pointing back to `POST /webhook/ad-intelligence`. When Apify completes, the webhook triggers background processing: dataset fetch, media download to Supabase Storage, optional Groq Whisper transcription, Claude Vision analysis (thumbnail + copy in one call), JSON validation with retry, and persistence to `ad_creatives` and `ad_analyses`.

Every major component has a direct precedent in the existing codebase. The webhook-fires-background-task pattern is implemented in `main.py` for three existing flows. `_transcribe_groq()` already exists in `flows/videos.py` and needs to be moved to `utils.py`. `call_claude()` in `utils.py` needs a new code path for vision content blocks (the current implementation only accepts a `user_message: str`). `parse_llm_json()` needs a retry wrapper. The new module `flows/ad_intelligence.py` follows the same structure as `flows/videos.py`.

The one area of genuine uncertainty is the exact field names in the Apify facebook-ads-scraper output schema. The `raw_apify_data jsonb` column in `ad_creatives` (established in Phase 1) acts as a safety net — all scraped data is persisted as-is, and the field mapping can be corrected without data loss if field names differ from expectations.

**Primary recommendation:** Implement the new module as `flows/ad_intelligence.py` mirroring `flows/videos.py` structure. Extend `call_claude()` to accept an optional `image_url` parameter that switches the user content from a plain string to a content block list. Move `_transcribe_groq()` to `utils.py` before writing the new flow. Keep all new prompts in `prompts.py` as `AD_ANALYSIS_SYSTEM`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.115.0 | HTTP endpoints, BackgroundTasks | Already in requirements.txt |
| httpx | 0.27.0 | Async HTTP for Apify, Groq, Anthropic, Supabase | Already in requirements.txt; shared `_client` in utils.py |
| python-dotenv | 1.0.1 | API key loading from .env | Already in requirements.txt |
| anthropic | 0.34.2 | Claude SDK | Already in requirements.txt; version supports vision |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| base64 (stdlib) | — | Encode image bytes for Anthropic base64 source | When Facebook CDN URL cannot be used as a direct URL (expiry risk) |
| json (stdlib) | — | JSON parsing with retry | Already used in parse_llm_json() |
| re (stdlib) | — | Strip markdown fences from LLM output | Already in parse_llm_json() |

### No New Installations Needed

All required libraries are already in `requirements.txt`. No `pip install` step in this phase.

---

## Architecture Patterns

### Recommended Module Structure

```
Fluxos em Python/
├── main.py                    # Add 2 new routes: POST /ad-intelligence/collect, POST /webhook/ad-intelligence
├── utils.py                   # Move _transcribe_groq here; extend call_claude for vision; extend parse_llm_json with retry
├── config.py                  # Add CLAUDE_MODEL_ADS constant
├── prompts.py                 # Add AD_ANALYSIS_SYSTEM prompt
└── flows/
    ├── ad_intelligence.py     # New module — main processing logic
    └── videos.py              # Remove _transcribe_groq (it moves to utils.py)
```

### Pattern 1: Apify Ad-Hoc Webhook Trigger

**What:** POST to Apify actor runs endpoint with `webhooks` query parameter (base64-encoded JSON array). Apify POSTs back to our webhook endpoint when the run finishes.

**When to use:** Every `POST /ad-intelligence/collect` call. Same pattern as existing flows but currently those webhooks are configured in Apify Console rather than per-request. Phase 2 uses ad-hoc webhooks so each collection run knows its competitor_id and collection_run_id.

**Apify endpoint:**
```
POST https://api.apify.com/v2/acts/{actor_id}/runs?token={APIFY_TOKEN}&webhooks={base64_webhooks}
```

**Webhook array (before base64 encoding):**
```python
# Source: https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks
import json, base64

webhooks = [
    {
        "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
        "requestUrl": "https://your-backend.com/webhook/ad-intelligence",
        "payloadTemplate": json.dumps({
            "resource": "{{resource}}",
            "competitor_id": competitor_id,
            "collection_run_id": collection_run_id,
        })
    }
]
webhooks_b64 = base64.b64encode(json.dumps(webhooks).encode()).decode()
```

**Actor input body** (POST request body, separate from webhooks):
```python
actor_input = {
    "startUrls": [{"url": f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&id={page_id}"}],
    # other facebook-ads-scraper fields TBD — see Open Questions
}
```

**Webhook callback payload** (what Apify sends to our endpoint):
The `{{resource}}` variable resolves to the actor run object, which includes `defaultDatasetId`. This matches how the existing flows extract `body.get("resource", {}).get("defaultDatasetId")`.

### Pattern 2: Extending call_claude() for Vision

**What:** The existing `call_claude()` accepts only a `user_message: str`. For vision, the user content must be a list of content blocks (image block + text block). Extend with an optional `image_url` parameter.

**When to use:** All ad analyses. For image ads: image_url = storage URL (or original URL if not yet uploaded). For video ads: image_url = thumbnail URL, with transcription appended to user_message text.

```python
# Source: https://platform.claude.com/docs/en/build-with-claude/vision
async def call_claude(
    system: str,
    user_message: str,
    model: str,
    max_tokens: int = 2000,
    custom_prompt: str = "",
    image_url: str = "",          # NEW optional parameter
) -> str:
    # ... existing custom_prompt handling ...

    # Build user content
    if image_url:
        user_content = [
            {
                "type": "image",
                "source": {
                    "type": "url",
                    "url": image_url,
                }
            },
            {
                "type": "text",
                "text": user_message,
            }
        ]
    else:
        user_content = user_message  # string — backward-compatible

    body = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
    }
    # ... rest of call unchanged ...
```

**Important:** Image must come before text in the content list for best Claude performance (per official docs tip: "images placed before text performs best").

**Image size limit:** 5MB per image for the API. Facebook ad thumbnails are typically well under this. No resize logic needed for thumbnails.

**URL-based vs base64:** Use `"type": "url"` with the Supabase Storage public URL (or original Facebook URL during processing). The `"type": "base64"` path requires downloading the image first — add fallback only if URL source fails.

### Pattern 3: JSON Retry Logic

**What:** Wrap parse_llm_json with retry: call Claude up to 3 times, stop as soon as a valid JSON without `error` key is returned.

**When to use:** Every ad analysis call.

```python
async def parse_with_retry(
    system: str,
    user_message: str,
    model: str,
    image_url: str = "",
    max_attempts: int = 3,
) -> tuple[dict, bool]:
    """
    Returns (parsed_dict, needs_reanalysis_flag).
    needs_reanalysis=True only after all attempts exhausted.
    """
    for attempt in range(1, max_attempts + 1):
        raw = await call_claude(system, user_message, model, image_url=image_url)
        result = parse_llm_json(raw)
        if "error" not in result:
            return result, False
        logger.warning(f"[ad_intelligence] JSON parse failed attempt {attempt}/{max_attempts}")
    return {"error": "parse_failed", "raw": raw[:500]}, True
```

### Pattern 4: Video Size Check (INF-04)

**What:** Check `len(video_bytes)` before calling `_transcribe_groq()`. Skip if over 25MB. Analysis still proceeds using thumbnail + copy.

```python
MAX_GROQ_BYTES = 25 * 1024 * 1024  # 25MB

transcription = ""
transcription_skipped = False

if video_url:
    video_bytes = await _download_media(video_url)
    if len(video_bytes) > MAX_GROQ_BYTES:
        logger.info(f"[ad_intelligence] video {ad_id} skipped transcription — {len(video_bytes)} bytes > 25MB")
        transcription_skipped = True
    else:
        transcription = await _transcribe_groq(video_bytes, filename="ad_video.mp4")
```

The `transcription_skipped` boolean maps to a column in `ad_creatives` (established in Phase 1 schema).

### Pattern 5: Supabase Storage Upload for Media

**What:** Download media bytes via httpx, upload to Supabase Storage bucket `ad-media`, store the resulting path in `ad_creatives`.

```python
async def upload_to_storage(
    file_bytes: bytes,
    storage_path: str,   # e.g. "ads/competitor_id/ad_id_thumb.jpg"
    content_type: str,   # e.g. "image/jpeg"
) -> str:
    """Upload bytes to Supabase Storage. Returns storage path."""
    url = f"{SUPABASE_URL}/storage/v1/object/ad-media/{storage_path}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY or SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY or SUPABASE_ANON}",
        "Content-Type": content_type,
    }
    resp = await _client.post(url, headers=headers, content=file_bytes)
    resp.raise_for_status()
    return storage_path
```

**Storage path convention:** `ads/{competitor_id}/{apify_ad_id}_thumb.jpg` and `ads/{competitor_id}/{apify_ad_id}_video.mp4`.

### Pattern 6: Collection Run Tracking

**What:** Create an `ad_collection_runs` record at collection start (status=pending), update counters as each ad is processed, set status=done/failed at end.

**Helper calls:**
```python
# On POST /ad-intelligence/collect
run_id = await create_collection_run(competitor_id)

# In webhook background processing, after dataset fetch
await update_collection_run(run_id, status="processing", total_ads=len(items))

# After each ad processed
await increment_collection_run(run_id, success=True)   # processed_ads += 1
await increment_collection_run(run_id, success=False)  # failed_ads += 1

# At end of batch
await update_collection_run(run_id, status="done", finished_at=now())

# If dataset is empty (0 items)
await update_collection_run(run_id, status="failed", finished_at=now())
```

**Empty dataset detection:** If `len(items) == 0`, mark run as failed immediately — do not silently accept as success (per success criteria #4).

### Anti-Patterns to Avoid

- **Polling Apify for run status:** Never poll in a loop. Always use webhooks — the existing pattern and user decision D-05.
- **Downloading media after initial persist:** Media URLs from Facebook expire in hours. Download and upload to Storage during webhook processing (D-06).
- **Storing analysis JSON inside ad_creatives JSONB:** Phase 1 established `ad_analyses` as a separate table with typed columns. Never put analysis results back into `raw_apify_data`.
- **Stopping the entire batch on one ad failure:** Individual ad failures must be caught with `try/except`, logged, and the batch must continue (D-12, same pattern as `flows/videos.py`).
- **Calling ffmpeg for large videos:** D-14 explicitly prohibits this. Skip and flag, do not attempt compression.
- **Saving a parse_failed analysis without needs_reanalysis=True:** The success criterion #3 forbids saving corrupted analysis silently. Always set `needs_reanalysis=True` in `ad_analyses` when all retry attempts fail.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP async calls | Custom connection pool | `_client = httpx.AsyncClient()` (already in utils.py) | Shared client handles connection reuse, timeouts |
| Groq Whisper transcription | Direct audio processing | `_transcribe_groq()` from `flows/videos.py` → move to `utils.py` | Already implemented, tested in production |
| JSON parse from LLM output | Custom markdown stripper | `parse_llm_json()` from `utils.py` + new retry wrapper | Handles ```json fences; just add the retry loop |
| Apify dataset fetch | Custom dataset pagination | `fetch_apify_dataset()` from `utils.py` | Already handles pagination edge cases |
| Claude API call | Raw httpx to Anthropic | `call_claude()` from `utils.py` (extended with image_url) | Handles headers, error logging, raise_for_status |
| Supabase REST CRUD | Raw httpx with manual headers | `supabase_post()` / `supabase_get()` from `utils.py` | Includes service key bypass for RLS |

---

## Common Pitfalls

### Pitfall 1: Apify Ad-Hoc Webhook Encoding

**What goes wrong:** The `webhooks` query parameter must be a base64-encoded JSON string. Passing raw JSON or URL-encoding the JSON directly causes Apify to silently ignore the webhook or return a 400 error.

**Why it happens:** Apify's API requires `base64.b64encode(json.dumps(webhooks).encode()).decode()` — the exact encoding matters.

**How to avoid:** Log the webhook payload before encoding and after decoding in tests. Verify with a real Apify run in development before running Phase 3.

**Warning signs:** Collection run stays in `pending` status forever; Apify run completes in Console but webhook endpoint never receives a POST.

### Pitfall 2: Facebook CDN URL Expiry in Claude Vision Calls

**What goes wrong:** If the media download to Supabase Storage fails, the pipeline might fall back to passing the original Facebook CDN URL to Claude Vision. These URLs may be expired by the time the webhook fires (especially if Apify run was slow).

**Why it happens:** Facebook ad media URLs are signed with expiry tokens. A run taking 10+ minutes may produce expired URLs.

**How to avoid:** Always download media to Supabase Storage first, then pass the Storage URL to Claude. If Storage upload fails, pass the original URL but log a warning that the URL may expire.

**Warning signs:** Claude Vision returning "I cannot see the image" or "image not accessible" in the analysis text.

### Pitfall 3: Empty Dataset Silently Accepted as Success

**What goes wrong:** `fetch_apify_dataset()` returns `[]` when the Apify actor found no ads. Without explicit `len(items) == 0` check, the pipeline logs "0 items processed" and marks the run as `done` — appearing as success to the user.

**Why it happens:** The existing `fetch_apify_dataset()` returns an empty list for both "actor ran but found nothing" and potential edge cases. There is no exception thrown.

**How to avoid:** Immediately after `items = await fetch_apify_dataset(dataset_id)`, check `if not items:` → update run to `failed` with a note and `return`.

**Warning signs:** Run shows `status=done`, `total_ads=0`, `processed_ads=0` in `ad_collection_runs`.

### Pitfall 4: needs_reanalysis Not Set When parse_failed

**What goes wrong:** Saving an `ad_analyses` row with `error: "parse_failed"` in the analysis fields but without `needs_reanalysis=True` causes the frontend to display broken data.

**Why it happens:** Easy to forget to set the flag when falling through the retry loop.

**How to avoid:** The `parse_with_retry()` helper returns `(result, needs_reanalysis_flag)` as a tuple. Always unpack both values and use `needs_reanalysis_flag` when writing to `ad_analyses`.

**Warning signs:** `ad_analyses` rows where `gancho` is null but `needs_reanalysis` is false.

### Pitfall 5: _transcribe_groq Still Imported From flows/videos.py

**What goes wrong:** If `flows/videos.py` still owns `_transcribe_groq` and `flows/ad_intelligence.py` imports from it, there is a circular-ish coupling and the function is not available for sharing.

**Why it happens:** Moving a function to `utils.py` requires updating the import in `flows/videos.py` too. Easy to move the function but forget to update the original import.

**How to avoid:** Move the function to `utils.py`, then update `flows/videos.py` to import it from `utils`, then import it from `utils` in `flows/ad_intelligence.py`. The planner should include this as a distinct task step.

**Warning signs:** Import error on startup, or `flows/videos.py` still has `_transcribe_groq` defined directly.

### Pitfall 6: Groq 25MB Check on Bytes vs File Size

**What goes wrong:** The 25MB limit is for the file upload to Groq, but some code checks the URL content-length header instead of the actual downloaded bytes length.

**Why it happens:** Content-Length headers are not always present, or may be for the compressed transfer size rather than uncompressed bytes.

**How to avoid:** Always download the full video bytes first, then check `len(video_bytes) > 25 * 1024 * 1024`. This is the authoritative size check.

---

## Code Examples

### Trigger Apify Actor With Ad-Hoc Webhook

```python
# Source: https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks
import base64, json
from config import APIFY_TOKEN

FACEBOOK_ADS_ACTOR_ID = "apify/facebook-ads-scraper"  # verify exact ID — see Open Questions

async def trigger_apify_collection(
    page_id: str,
    competitor_id: str,
    collection_run_id: str,
    webhook_base_url: str,  # e.g. "https://criativos-api.railway.app"
) -> str:
    """Returns the Apify run ID."""
    webhooks = [
        {
            "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
            "requestUrl": f"{webhook_base_url}/webhook/ad-intelligence",
            "payloadTemplate": json.dumps({
                "resource": "{{resource}}",
                "competitor_id": competitor_id,
                "collection_run_id": collection_run_id,
            }),
        }
    ]
    webhooks_b64 = base64.b64encode(json.dumps(webhooks).encode()).decode()

    actor_input = {
        "startUrls": [
            {"url": f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&id={page_id}"}
        ],
        # Additional fields depend on scraper version — see Open Questions
    }

    resp = await _client.post(
        f"https://api.apify.com/v2/acts/{FACEBOOK_ADS_ACTOR_ID}/runs"
        f"?token={APIFY_TOKEN}&webhooks={webhooks_b64}",
        json=actor_input,
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()["data"]["id"]
```

### Claude Vision Call (Single Request — Image + Copy)

```python
# Source: https://platform.claude.com/docs/en/build-with-claude/vision
# Extending existing call_claude() in utils.py

async def call_claude(
    system: str,
    user_message: str,
    model: str,
    max_tokens: int = 2000,
    custom_prompt: str = "",
    image_url: str = "",
) -> str:
    # ... existing custom_prompt handling unchanged ...

    if image_url:
        user_content = [
            {"type": "image", "source": {"type": "url", "url": image_url}},
            {"type": "text", "text": user_message},
        ]
    else:
        user_content = user_message

    body = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
    }
    # ... rest of call unchanged ...
```

### AD_ANALYSIS_SYSTEM Prompt Shape

```python
# In prompts.py — add after existing prompts
AD_ANALYSIS_SYSTEM = """# ANALISTA DE ANÚNCIOS — Extração Objetiva de Dados

Você é um analista neutro de publicidade digital. Sua função é analisar anúncios do Facebook Ad Library e extrair dados estruturados objetivamente — sem opinião criativa, sem persona fixa.

## INSTRUÇÕES

Para cada anúncio fornecido (imagem/thumbnail + copy), extraia:

1. **gancho** — A primeira frase ou elemento visual que captura atenção (1 frase)
2. **tipo_gancho** — Categoria do gancho: Pergunta / Estatística / Afirmação Bold / Prova Social / Problema / Curiosidade / Oferta
3. **angulo** — A tese central do anúncio — argumento principal usado para convencer (1-2 frases)
4. **tag_angulo** — Tag curta do ângulo: Medo de Perder / Aspiração / Educação / Autoridade / Urgência / Economizar / Resultado
5. **cta** — O call-to-action principal identificado (texto exato se visível, ou descrição)
6. **estrutura** — Como o anúncio está organizado: sequência de elementos (ex: "Problema → Solução → Prova → CTA")
7. **score** — Nota de 1 a 10 baseada nos critérios abaixo
8. **insights** — Lista de 2-3 observações objetivas sobre a técnica usada (não é opinião, é análise)

## CRITÉRIOS DE SCORE (1-10)

| Critério | Peso |
|----------|------|
| Clareza da proposta de valor | 20% |
| Qualidade e força do gancho | 20% |
| Força do CTA (direto, específico, urgente) | 20% |
| Originalidade / diferenciação | 10% |
| Relevância para o público-alvo estimado | 15% |
| Potencial de engajamento | 15% |

## FORMATO DE SAÍDA — JSON PURO

Responda APENAS com JSON válido. Sem texto antes ou depois. Sem blocos de código.

{
  "gancho": "texto do gancho identificado",
  "tipo_gancho": "Pergunta",
  "angulo": "descrição do ângulo principal",
  "tag_angulo": "Medo de Perder",
  "cta": "texto ou descrição do CTA",
  "estrutura": "Problema → Solução → Prova → CTA",
  "score": 7,
  "insights": [
    "observação objetiva 1",
    "observação objetiva 2",
    "observação objetiva 3"
  ]
}

IMPORTANTE: Retorne APENAS o JSON. Se a imagem não estiver acessível, use o copy disponível e preencha os campos visuais com base no texto."""
```

### Webhook Handler in main.py

```python
# New routes to add to main.py

from flows.ad_intelligence import process_ad_intelligence_webhook

@app.post("/ad-intelligence/collect")
async def collect_ads(request: Request, background_tasks: BackgroundTasks):
    """
    Trigger manual ad collection for a competitor.
    Body: {"competitor_id": "uuid", "page_id": "string"}
    Returns immediately — processing happens async via Apify webhook.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    competitor_id = body.get("competitor_id")
    page_id = body.get("page_id")

    if not competitor_id or not page_id:
        return JSONResponse({"error": "competitor_id and page_id required"}, status_code=400)

    # Create collection run record (status=pending)
    # Trigger Apify actor run with ad-hoc webhook
    # Return run_id immediately
    background_tasks.add_task(trigger_collection, competitor_id, page_id)
    return JSONResponse({"received": True, "flow": "ad-intelligence"})


@app.post("/webhook/ad-intelligence")
async def webhook_ad_intelligence(request: Request, background_tasks: BackgroundTasks):
    """
    Apify calls this endpoint when the facebook-ads-scraper run finishes.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    dataset_id = body.get("resource", {}).get("defaultDatasetId")
    logger.info(f"[webhook] /ad-intelligence recebido — dataset={dataset_id}")
    background_tasks.add_task(process_ad_intelligence_webhook, body)
    return JSONResponse({"received": True, "flow": "ad-intelligence"})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenRouter for carrossel vision | Direct Anthropic API for ads vision | D-08 (this phase) | One fewer API key; consistent with main Claude calls; slightly cheaper |
| _transcribe_groq in flows/videos.py | _transcribe_groq in utils.py | D-13/this phase | Shared between videos and ads flows; no duplication |

**Deprecated/outdated in context of this phase:**
- `OPENROUTER_API_KEY` / `OPENROUTER_VISION_MODEL` in `config.py`: Used by `flows/carrossel.py` for existing Instagram carousel flow. Do NOT remove — existing flow still uses it. New ad intelligence flow uses direct Anthropic.

---

## Open Questions

1. **Apify facebook-ads-scraper exact actor ID and field names**
   - What we know: The actor exists on Apify marketplace. The existing `fetch_apify_dataset()` utility works for any dataset ID. The `raw_apify_data jsonb` column in Phase 1 absorbs unknown fields.
   - What's unclear: The exact actor ID slug (likely `apify/facebook-ads-scraper` or a community variant), and which fields the output contains for `ad_id`, `image_url`, `video_url`, `thumbnail_url`, `ad_copy`, `is_active`. Field names may differ from expectations.
   - Recommendation: The planner should include a Wave 0 task to perform one test run of the actor against a real Facebook page and log the raw output before writing field mappings. Until then, use `raw_apify_data` as the authoritative source and extract fields defensively with `.get()` + fallbacks.
   - Confidence: MEDIUM

2. **APIFY_BACKEND_WEBHOOK_URL configuration**
   - What we know: The `POST /webhook/ad-intelligence` endpoint must be publicly accessible for Apify to call it. The existing webhooks in the Apify Console likely point to the current production URL.
   - What's unclear: Where is the standalone FastAPI backend deployed? The `Procfile` and `runtime.txt` suggest Railway or similar. The webhook URL needs to be an env var.
   - Recommendation: Add `BACKEND_URL` to `config.py` as `os.getenv("BACKEND_URL", "")` and require it to be set in `.env`. The planner should include a verification step that `BACKEND_URL` is set before triggering the first collection.
   - Confidence: LOW (deployment URL not confirmed in codebase)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|---------|
| Python + FastAPI | Backend server | Need to verify | — | — |
| Anthropic API key | Claude Vision calls | Configured in config.py (required from .env) | — | None — blocks analysis |
| Apify token | Actor trigger | Configured in config.py (hardcoded fallback) | — | None — blocks collection |
| Groq API key | Whisper transcription | Configured in config.py (hardcoded fallback) | — | transcription_skipped=True for affected ads |
| Supabase service key | Storage upload + RLS bypass | SUPABASE_SERVICE_KEY in config.py | — | Falls back to anon key (may fail RLS for writes) |
| BACKEND_URL env var | Ad-hoc webhook URL | Not confirmed in codebase | — | Collection trigger fails silently if not set |

**Missing dependencies with no fallback:**
- `BACKEND_URL` — must be set for ad-hoc webhooks to reach the callback endpoint. Without it, collections trigger Apify runs but results are never processed.

**Missing dependencies with fallback:**
- `GROQ_API_KEY` — if Groq is down or limit hit, `transcription_skipped=True` is the graceful degradation. Analysis still proceeds with thumbnail + copy.

---

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Not detected — no pytest.ini, no test/ directory in project |
| Config file | None — Wave 0 must create |
| Quick run command | `pytest tests/test_ad_intelligence.py -x` |
| Full suite command | `pytest tests/ -x` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COL-03 | POST /ad-intelligence/collect returns 200 immediately | smoke (httpx TestClient) | `pytest tests/test_ad_intelligence.py::test_collect_returns_immediately -x` | Wave 0 |
| ANA-01 | _transcribe_groq skips files > 25MB, sets transcription_skipped | unit | `pytest tests/test_utils.py::test_transcribe_skip_over_25mb -x` | Wave 0 |
| ANA-04 | parse_with_retry exhausts 3 attempts and sets needs_reanalysis | unit | `pytest tests/test_utils.py::test_parse_with_retry_exhausted -x` | Wave 0 |
| INF-04 | Video size check: 25MB threshold correct | unit | `pytest tests/test_utils.py::test_video_size_threshold -x` | Wave 0 |
| COL-03 | Empty Apify dataset marks collection_run as failed | unit | `pytest tests/test_ad_intelligence.py::test_empty_dataset_fails_run -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_utils.py -x`
- **Per wave merge:** `pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_utils.py` — unit tests for extended utils (retry, size check, _transcribe_groq)
- [ ] `tests/test_ad_intelligence.py` — integration tests for new endpoints and flow
- [ ] `tests/conftest.py` — shared fixtures (mock httpx, mock Supabase responses)
- [ ] Framework install: `pip install pytest pytest-asyncio httpx` — if not in requirements.txt

---

## Sources

### Primary (HIGH confidence)

- [Anthropic Vision API docs](https://platform.claude.com/docs/en/build-with-claude/vision) — image content block format, URL vs base64, size limits (5MB per image)
- [Apify Ad-Hoc Webhooks](https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks) — base64-encoded webhooks query param, eventTypes, payloadTemplate with {{resource}}
- Existing codebase: `Fluxos em Python/utils.py`, `Fluxos em Python/flows/videos.py`, `Fluxos em Python/main.py` — direct inspection of all reusable patterns

### Secondary (MEDIUM confidence)

- [Groq Speech-to-Text docs](https://console.groq.com/docs/speech-to-text) — 25MB file size limit for free tier confirmed; paid tier supports 100MB via URL
- [Groq blog post: Whisper Large v3 on GroqCloud](https://groq.com/blog/largest-most-capable-asr-model-now-faster-on-groqcloud) — 100MB limit for paid customers
- Apify Webhook Payload Actions — `{{resource}}` resolves to actor run object with `defaultDatasetId`

### Tertiary (LOW confidence — needs validation before first real run)

- Apify facebook-ads-scraper output field names — not verified against live actor; `raw_apify_data` column absorbs uncertainty

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in requirements.txt; versions verified in codebase
- Architecture: HIGH — all patterns have direct precedent in existing flows; only vision extension is new
- Apify actor field schema: MEDIUM — actor exists but output field names need validation on first real run
- Pitfalls: HIGH — derived from direct code inspection and official API docs
- Groq 25MB limit: HIGH — confirmed in official docs (free tier); paid tier is 100MB

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable APIs; Apify scraper schema should be validated on first real run regardless)
