"""
Fluxo: Ad Intelligence Pipeline
Processa ciclo completo de coleta e analise de anuncios:
  1. Dispara Apify actor com ad-hoc webhook (trigger_collection)
  2. Recebe callback do Apify (process_ad_intelligence_webhook)
  3. Baixa midia para Supabase Storage
  4. Transcreve audio de videos (Groq Whisper, skip >25MB)
  5. Analisa com Claude Vision (imagem + copy, single call)
  6. Persiste em ad_creatives e ad_analyses
"""

import base64
import json
import logging
import re
from datetime import datetime, timezone

from config import (
    APIFY_TOKEN,
    BACKEND_URL,
    CLAUDE_MODEL_ADS,
    FACEBOOK_ADS_ACTOR_ID,
    SUPABASE_HEADERS,
    SUPABASE_URL,
)
from prompts import AD_ANALYSIS_SYSTEM
from utils import (
    _client,
    _transcribe_groq,
    fetch_apify_dataset,
    parse_with_retry,
    supabase_post,
    upload_to_storage,
)

logger = logging.getLogger(__name__)

MAX_GROQ_BYTES = 25 * 1024 * 1024  # 25MB — D-14


# ── Collection Run Helpers ────────────────────────────────────────────────

AD_ANALYST_SKILL_APPENDIX = """
FORMATO OBRIGATORIO DA ANALISE:
- Continue respondendo em JSON valido.
- Preserve as chaves ja usadas pelo sistema: gancho, tipo_gancho, tag_angulo, cta, estrutura, score e insights.
- Adicione tambem a chave `relatorio_skill` com um texto em markdown usando, nesta ordem, as secoes:
  1. Visao Geral
  2. Funil identificado
  3. Anuncios mais antigos
  4. Padroes
  5. Oportunidades
  6. Acao recomendada
- Use os campos copy, transcricao, criativo e sinais temporais do anuncio para sustentar o relatorio.
- Em `insights`, priorize observacoes acionaveis que reforcem o relatorio_skill.
"""


async def _create_collection_run(competitor_id: str) -> str:
    """Create ad_collection_runs record with status=running. Returns run id."""
    result = await supabase_post("ad_collection_runs", {
        "competitor_id": competitor_id,
        "status": "running",
    })
    if isinstance(result, list):
        result = result[0]
    return result["id"]


async def _update_collection_run(run_id: str, **fields) -> None:
    """Update ad_collection_runs record via PATCH."""
    resp = await _client.patch(
        f"{SUPABASE_URL}/rest/v1/ad_collection_runs?id=eq.{run_id}",
        headers=SUPABASE_HEADERS,
        json=fields,
    )
    resp.raise_for_status()


# ── Apify Trigger ─────────────────────────────────────────────────────────

async def trigger_collection(competitor_id: str, page_id: str, max_ads: int = 50) -> None:
    """
    Creates a collection run, triggers Apify actor with ad-hoc webhook.
    Called as BackgroundTask from POST /ad-intelligence/collect.
    """
    run_id = await _create_collection_run(competitor_id)
    logger.info(f"[ad_intelligence] collection_run {run_id} created for competitor {competitor_id}")

    backend_base = (BACKEND_URL or "").rstrip("/")
    if not backend_base:
        logger.error("[ad_intelligence] BACKEND_URL not set — cannot configure webhook callback")
        await _update_collection_run(run_id, status="failed", error_message="BACKEND_URL not configured")
        return

    # Build ad-hoc webhook (per Apify docs — base64 encoded JSON array)
    webhooks = [
        {
            "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED"],
            "requestUrl": f"{backend_base}/webhook/ad-intelligence",
            "payloadTemplate": '{"resource": {{resource}}, "competitor_id": "' + competitor_id + '", "collection_run_id": "' + run_id + '", "max_ads": ' + str(max_ads) + '}',
        }
    ]
    webhooks_b64 = base64.b64encode(json.dumps(webhooks).encode()).decode()

    # Actor requires minimum 10 — enforce floor here, trim results later
    apify_max = max(max_ads, 10)

    actor_input = {
        "urls": [
            {"url": f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&view_all_page_id={page_id}"}
        ],
        "maxResults": apify_max,
    }

    try:
        resp = await _client.post(
            f"https://api.apify.com/v2/acts/{FACEBOOK_ADS_ACTOR_ID}/runs"
            f"?token={APIFY_TOKEN}&maxItems={apify_max}&webhooks={webhooks_b64}",
            json=actor_input,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        apify_run_id = resp.json()["data"]["id"]
        await _update_collection_run(run_id, apify_run_id=apify_run_id)
        logger.info(f"[ad_intelligence] Apify run {apify_run_id} triggered for competitor {competitor_id}")
    except Exception as e:
        logger.exception(f"[ad_intelligence] Failed to trigger Apify: {e}")
        await _update_collection_run(
            run_id,
            status="failed",
            error_message=str(e)[:500],
            completed_at=datetime.now(timezone.utc).isoformat(),
        )


# ── Media Download ────────────────────────────────────────────────────────

async def _download_media(url: str) -> bytes:
    """Download media bytes from URL."""
    resp = await _client.get(url, follow_redirects=True, timeout=180.0)
    resp.raise_for_status()
    return resp.content


# ── Single Ad Processing ──────────────────────────────────────────────────

async def _process_single_ad(
    item: dict,
    competitor_id: str,
    collection_run_id: str,
) -> bool:
    """
    Process one ad from Apify dataset:
    1. Extract fields from raw data (defensively with .get())
    2. Download and upload media to Supabase Storage
    3. Transcribe video if applicable (skip >25MB per D-14)
    4. Analyze with Claude Vision (single call per D-09)
    5. Persist to ad_creatives and ad_analyses

    Returns True on success, False on failure.
    """
    # Extract fields — mapped to curious_coder/facebook-ads-library-scraper output
    snapshot = item.get("snapshot") or {}

    ad_id = item.get("ad_archive_id") or item.get("ad_id") or ""
    ad_url = item.get("ad_library_url") or item.get("ad_url") or ""

    # body is an object {"text": "..."} in this actor
    body_raw = snapshot.get("body") or item.get("body") or {}
    body_text = body_raw.get("text", "") if isinstance(body_raw, dict) else str(body_raw)

    # DPA (Dynamic Product Ads) have template placeholders like {{product.brand}}
    # These are useless for analysis — keep original for DB but flag for Claude
    is_dpa_template = bool(body_text and re.search(r"\{\{.*?\}\}", body_text))

    # Media: videos and images are nested inside snapshot
    snapshot_videos = snapshot.get("videos") or []
    snapshot_images = snapshot.get("images") or []
    snapshot_cards = snapshot.get("cards") or []

    video_url = ""
    thumbnail_url = ""
    if snapshot_videos:
        v = snapshot_videos[0]
        video_url = v.get("video_hd_url") or v.get("video_sd_url") or ""
        thumbnail_url = v.get("video_preview_image_url") or ""
    elif snapshot_images:
        img = snapshot_images[0]
        thumbnail_url = img.get("original_image_url") or img.get("resized_image_url") or ""
    elif snapshot_cards:
        card = snapshot_cards[0]
        thumbnail_url = card.get("original_image_url") or card.get("resized_image_url") or ""

    display_format = (snapshot.get("display_format") or "").upper()
    if video_url:
        creative_type = "video"
    elif display_format == "DPA" or snapshot_cards:
        creative_type = "carousel"
    else:
        creative_type = "image"

    cta_type = snapshot.get("cta_type") or item.get("cta_type") or ""

    def _parse_date(val):
        """Convert unix timestamp (int/str) or date string to ISO format."""
        if val is None:
            return None
        if isinstance(val, (int, float)):
            return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
        if isinstance(val, str) and val.isdigit():
            return datetime.fromtimestamp(int(val), tz=timezone.utc).isoformat()
        return val  # already a date string

    start_date = _parse_date(item.get("start_date"))
    end_date = _parse_date(item.get("end_date"))

    ad_status = "ativo" if item.get("is_active") else "inativo"
    platforms = item.get("publisher_platform") or []
    if isinstance(platforms, str):
        platforms = [platforms]

    logger.info(f"[ad_intelligence] processing ad {ad_id or '(no id)'} — type={creative_type}, status={ad_status}")

    # -- Media download + Storage upload (D-06: during webhook processing) --
    storage_image_path = ""
    storage_video_path = ""
    file_size_bytes = None
    image_bytes_for_vision: bytes | None = None  # send as base64 to Claude (robots.txt blocks URL)
    video_bytes_downloaded = None  # tracks downloaded video bytes to avoid re-download

    if thumbnail_url:
        try:
            img_bytes = await _download_media(thumbnail_url)
            image_bytes_for_vision = img_bytes
            storage_path = f"ads/{competitor_id}/{ad_id or 'unknown'}_thumb.jpg"
            storage_image_path = await upload_to_storage(img_bytes, storage_path, "image/jpeg")
        except Exception as e:
            logger.warning(f"[ad_intelligence] ad {ad_id} thumbnail download/upload failed: {e}")

    if video_url:
        try:
            video_bytes = await _download_media(video_url)
            file_size_bytes = len(video_bytes)
            storage_path = f"ads/{competitor_id}/{ad_id or 'unknown'}_video.mp4"
            storage_video_path = await upload_to_storage(video_bytes, storage_path, "video/mp4")
            video_bytes_downloaded = video_bytes
        except Exception as e:
            logger.warning(f"[ad_intelligence] ad {ad_id} video download/upload failed: {e}")
            file_size_bytes = None

    # -- Transcription (ANA-01, INF-04, D-14) --
    transcricao = ""
    transcription_skipped = False

    if video_url and file_size_bytes is not None:
        if file_size_bytes > MAX_GROQ_BYTES:
            logger.info(f"[ad_intelligence] ad {ad_id} video skipped transcription — {file_size_bytes} bytes > 25MB")
            transcription_skipped = True
        else:
            try:
                video_bytes_for_groq = video_bytes_downloaded if video_bytes_downloaded is not None else await _download_media(video_url)
                transcricao = await _transcribe_groq(video_bytes_for_groq, filename="ad_video.mp4")
                logger.info(f"[ad_intelligence] ad {ad_id} transcribed ({len(transcricao)} chars)")
            except Exception as e:
                logger.warning(f"[ad_intelligence] ad {ad_id} transcription failed: {e}")
                transcription_skipped = True

    # -- Persist ad_creatives --
    creative_data = {
        "competitor_id": competitor_id,
        "collection_run_id": collection_run_id,
        "ad_id": ad_id or None,
        "ad_url": ad_url or None,
        "creative_type": creative_type,
        "thumbnail_url": thumbnail_url or None,
        "video_url": video_url or None,
        "body_text": body_text or None,
        "cta_type": cta_type or None,
        "start_date": start_date,
        "end_date": end_date,
        "status": ad_status or None,
        "platforms": platforms or None,
        "storage_image_path": storage_image_path or None,
        "storage_video_path": storage_video_path or None,
        "transcricao": transcricao or None,
        "file_size_bytes": file_size_bytes,
        "raw_apify_data": item,
    }

    creative_result = await supabase_post("ad_creatives", creative_data)
    if isinstance(creative_result, list):
        creative_result = creative_result[0]
    creative_id = creative_result["id"]

    # -- Claude Analysis (ANA-02, ANA-03, D-08, D-09, D-10) --
    # For DPA template ads, ignore body_text for analysis (Claude can't use {{product.brand}})
    analysis_body = "" if is_dpa_template else body_text
    if is_dpa_template:
        logger.info(f"[ad_intelligence] ad {ad_id} has DPA template body — analyzing from image only")

    user_msg_parts = []
    if analysis_body:
        user_msg_parts.append(f"COPY DO ANUNCIO:\n{analysis_body}")
    if transcricao:
        user_msg_parts.append(f"TRANSCRICAO DO VIDEO:\n{transcricao}")
    if transcription_skipped:
        user_msg_parts.append("NOTA: Video acima de 25MB — transcricao nao disponivel. Analise baseada em thumbnail + copy.")
    if is_dpa_template:
        user_msg_parts.append("NOTA: Este e um anuncio DPA (Dynamic Product Ad) com texto template. Analise baseada apenas na imagem.")
    if not analysis_body and not transcricao and not is_dpa_template:
        user_msg_parts.append("Nenhum texto disponivel. Analise baseada apenas na imagem.")

    user_message = "\n\n".join(user_msg_parts)

    # D-09: single call with image + copy; D-10: for video send thumbnail
    # Send image as base64 to avoid robots.txt / CDN access issues
    analysis_result, needs_reanalysis = await parse_with_retry(
        system=AD_ANALYSIS_SYSTEM + "\n\n" + AD_ANALYST_SKILL_APPENDIX,
        user_message=user_message,
        model=CLAUDE_MODEL_ADS,
        image_bytes=image_bytes_for_vision,
        max_attempts=3,
    )

    # -- Persist ad_analyses --
    analysis_data = {
        "creative_id": creative_id,
        "hook_text": analysis_result.get("gancho"),
        "hook_type": analysis_result.get("tipo_gancho"),
        "angle_tag": analysis_result.get("tag_angulo"),
        "cta_analysis": analysis_result.get("cta"),
        "structure_summary": analysis_result.get("estrutura"),
        "score": analysis_result.get("score"),
        "insights": json.dumps(analysis_result.get("insights", []), ensure_ascii=False) if isinstance(analysis_result.get("insights"), list) else analysis_result.get("insights"),
        "needs_reanalysis": needs_reanalysis,
        "prompt_version": "v1",
        "full_analysis": analysis_result,
    }

    await supabase_post("ad_analyses", analysis_data)
    logger.info(f"[ad_intelligence] ad {ad_id} analyzed — score={analysis_result.get('score')} needs_reanalysis={needs_reanalysis}")

    return True


# ── Webhook Handler ───────────────────────────────────────────────────────

async def process_ad_intelligence_webhook(webhook_body: dict) -> None:
    """
    Main entry point when Apify webhook fires.
    Fetches dataset, processes each ad, updates collection run.
    """
    resource = webhook_body.get("resource", {})
    dataset_id = resource.get("defaultDatasetId")
    competitor_id = webhook_body.get("competitor_id", "")
    collection_run_id = webhook_body.get("collection_run_id", "")
    max_ads = webhook_body.get("max_ads", 50)

    if not dataset_id:
        logger.error("[ad_intelligence] webhook missing defaultDatasetId")
        if collection_run_id:
            await _update_collection_run(
                collection_run_id,
                status="failed",
                error_message="Missing defaultDatasetId in webhook payload",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
        return

    logger.info(f"[ad_intelligence] webhook received — dataset={dataset_id}, competitor={competitor_id}, run={collection_run_id}")

    # Check for Apify run failure
    event_type = webhook_body.get("eventType") or ""
    if "FAILED" in event_type.upper():
        logger.error(f"[ad_intelligence] Apify run failed — event={event_type}")
        if collection_run_id:
            await _update_collection_run(
                collection_run_id,
                status="failed",
                error_message=f"Apify run failed: {event_type}",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
        return

    # Fetch dataset with API-level limit + Python safety net
    items = await fetch_apify_dataset(dataset_id, limit=max_ads)
    logger.info(f"[ad_intelligence] dataset {dataset_id} returned {len(items)} items (limit={max_ads})")
    if items:
        logger.info(f"[ad_intelligence] sample item keys: {list(items[0].keys())}")
        logger.info(f"[ad_intelligence] sample item: {json.dumps(items[0], default=str, ensure_ascii=False)[:2000]}")
    items = items[:max_ads]  # safety net

    # Empty dataset detection (success criterion #4)
    if not items:
        logger.warning(f"[ad_intelligence] dataset {dataset_id} is empty — marking run as failed")
        if collection_run_id:
            await _update_collection_run(
                collection_run_id,
                status="failed",
                dataset_id=dataset_id,
                ads_found=0,
                error_message="Apify dataset returned 0 items",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
        return

    # Update run to processing
    if collection_run_id:
        await _update_collection_run(
            collection_run_id,
            status="processing",
            dataset_id=dataset_id,
            ads_found=len(items),
        )

    # Process each ad individually (D-12: failure does not stop batch)
    processed = 0
    failed = 0

    for item in items:
        try:
            success = await _process_single_ad(item, competitor_id, collection_run_id)
            if success:
                processed += 1
            else:
                failed += 1
        except Exception as e:
            failed += 1
            ad_id = item.get("ad_id") or item.get("adId") or item.get("id") or "unknown"
            logger.exception(f"[ad_intelligence] Error processing ad {ad_id}: {e}")

        # Update counters periodically
        if collection_run_id and (processed + failed) % 5 == 0:
            await _update_collection_run(
                collection_run_id,
                ads_processed=processed + failed,
            )

    # Final update
    if collection_run_id:
        await _update_collection_run(
            collection_run_id,
            status="done",
            ads_processed=processed + failed,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    # Update last_collected_at on competitor (per D-06)
    if competitor_id:
        try:
            resp = await _client.patch(
                f"{SUPABASE_URL}/rest/v1/ad_competitors?id=eq.{competitor_id}",
                headers=SUPABASE_HEADERS,
                json={"last_collected_at": datetime.now(timezone.utc).isoformat()},
            )
            resp.raise_for_status()
            logger.info(f"[ad_intelligence] updated last_collected_at for competitor {competitor_id}")
        except Exception as e:
            logger.warning(f"[ad_intelligence] failed to update last_collected_at: {e}")

    logger.info(f"[ad_intelligence] batch complete — processed={processed}, failed={failed}, total={len(items)}")
