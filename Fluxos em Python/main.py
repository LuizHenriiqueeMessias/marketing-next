"""
N-HUB Pipeline — Instagram Content Automation
FastAPI app com 3 endpoints webhook (um por fluxo).

Rotas:
  POST /webhook/estaticos   ← imagens simples
  POST /webhook/carrossel   ← carrosseis (Sidecar)
  POST /webhook/videos      ← vídeos (Whisper + Claude)

Todos os fluxos rodam em background (retornam 200 imediatamente).
"""

import base64
import json
import logging
import sys
from contextlib import asynccontextmanager
from urllib.parse import quote, urlparse

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from flows.estaticos import process_estaticos
from flows.carrossel import process_carrossel
from flows.videos import process_videos
from flows.ad_intelligence import trigger_collection, process_ad_intelligence_webhook
from flows.tiktok import process_tiktok
from flows.youtube import process_youtube
from bestcontent import rank_and_curate
from roteiro import generate_roteiro
from scheduler import start_scheduler, shutdown_scheduler
from config import APIFY_ACTOR_ID, APIFY_TOKEN, APIFY_TIKTOK_ACTOR_ID, APIFY_YOUTUBE_ACTOR_ID, BACKEND_URL
from transcribe_batch import router as transcribe_batch_router
from utils import _client, normalize_post_url

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("nhub_pipeline.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def _escape_json_string(value: str) -> str:
    return (
        value
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def _build_payload_template(payload: dict) -> str:
    parts = ['"resource": {{resource}}']

    for key, value in payload.items():
        if value is None:
            parts.append(f'"{key}": null')
            continue

        if isinstance(value, (int, float)) and not isinstance(value, bool):
            parts.append(f'"{key}": {value}')
            continue

        if isinstance(value, bool):
            parts.append(f'"{key}": {"true" if value else "false"}')
            continue

        serialized = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        parts.append(f'"{key}": "{_escape_json_string(serialized)}"')

    return "{" + ", ".join(parts) + "}"


def _normalize_base_url(value: str | None) -> str:
    return (value or "").strip().rstrip("/")


def _is_private_hostname(hostname: str | None) -> bool:
    if not hostname:
        return True

    lower = hostname.lower()
    if lower in {"localhost", "127.0.0.1", "::1"}:
        return True
    if lower.endswith(".local"):
        return True
    if lower.startswith("10."):
        return True
    if lower.startswith("192.168."):
        return True
    if lower.startswith("172."):
        parts = lower.split(".")
        if len(parts) > 1:
            try:
                second_octet = int(parts[1])
                return 16 <= second_octet <= 31
            except ValueError:
                return False
    return False


def _is_public_base_url(value: str | None) -> bool:
    normalized = _normalize_base_url(value)
    if not normalized:
        return False

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        return False

    return not _is_private_hostname(parsed.hostname)


def _resolve_backend_base_url(request: Request, requested_base_url: str | None = None) -> str:
    request_base_url = _normalize_base_url(str(request.base_url))
    for candidate in (requested_base_url, request_base_url, BACKEND_URL):
        normalized = _normalize_base_url(candidate)
        if _is_public_base_url(normalized):
            return normalized
    return ""


def _safe_int(value, fallback):
    try:
        return int(value)
    except Exception:
        return fallback


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app):
    start_scheduler()
    yield
    shutdown_scheduler()


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="N-HUB Pipeline",
    description="Webhooks de processamento de conteúdo Instagram para Supabase",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transcribe_batch_router)
app.include_router(transcribe_batch_router, prefix="/api")


@app.get("/")
@app.get("/health")
@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Estáticos ─────────────────────────────────────────────────────────────────
@app.post("/webhook/estaticos")
@app.post("/api/webhook/estaticos")
async def webhook_estaticos(request: Request, background_tasks: BackgroundTasks):
    """
    Apify chama este endpoint quando termina de scraper posts estáticos.
    Processa apenas imagens (type != Video, type != Sidecar).
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    logger.info(f"[webhook] /estaticos recebido — dataset={body.get('resource', {}).get('defaultDatasetId')}")
    logger.info(f"[webhook] /estaticos custom_prompt presente: {'custom_prompt' in body} — valor: '{str(body.get('custom_prompt', ''))[:100]}'")
    logger.info(f"[webhook] /estaticos keys no body: {list(body.keys())}")
    background_tasks.add_task(process_estaticos, body)
    return JSONResponse({"received": True, "flow": "estaticos"})


# ── Carrossel ─────────────────────────────────────────────────────────────────
@app.post("/webhook/carrossel")
@app.post("/api/webhook/carrossel")
async def webhook_carrossel(request: Request, background_tasks: BackgroundTasks):
    """
    Apify chama este endpoint quando termina de scraper posts com carrossel.
    Processa apenas Sidecar; usa Vision API para extrair conteúdo dos slides.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    logger.info(f"[webhook] /carrossel recebido — dataset={body.get('resource', {}).get('defaultDatasetId')}")
    logger.info(f"[webhook] /carrossel custom_prompt presente: {'custom_prompt' in body} — valor: '{str(body.get('custom_prompt', ''))[:100]}'")
    logger.info(f"[webhook] /carrossel keys no body: {list(body.keys())}")
    background_tasks.add_task(process_carrossel, body)
    return JSONResponse({"received": True, "flow": "carrossel"})


# ── Vídeos ────────────────────────────────────────────────────────────────────
@app.post("/webhook/videos")
@app.post("/api/webhook/videos")
async def webhook_videos(request: Request, background_tasks: BackgroundTasks):
    """
    Apify chama este endpoint quando termina de scraper vídeos.
    Baixa áudio, transcreve com Groq Whisper e gera readaptação com Claude.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    logger.info(f"[webhook] /videos recebido — dataset={body.get('resource', {}).get('defaultDatasetId')}")
    logger.info(f"[webhook] /videos custom_prompt presente: {'custom_prompt' in body} — valor: '{str(body.get('custom_prompt', ''))[:100]}'")
    logger.info(f"[webhook] /videos keys no body: {list(body.keys())}")
    background_tasks.add_task(process_videos, body)
    return JSONResponse({"received": True, "flow": "videos"})


# ── Ad Intelligence ──────────────────────────────────────────────────────────
@app.post("/ad-intelligence/collect")
@app.post("/api/ad-intelligence/collect")
async def collect_ads(request: Request, background_tasks: BackgroundTasks):
    """
    Dispara coleta manual de anuncios de um concorrente via Apify.
    Body: {"competitor_id": "uuid", "page_id": "string"}
    Retorna imediatamente — processamento async via webhook do Apify.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    competitor_id = body.get("competitor_id")
    page_id = body.get("page_id")
    max_ads = body.get("max_ads", 50)

    if not competitor_id or not page_id:
        return JSONResponse(
            {"error": "competitor_id and page_id required"},
            status_code=400,
        )

    logger.info(f"[ad-intelligence] collect triggered — competitor={competitor_id}, page={page_id}, max_ads={max_ads}")
    background_tasks.add_task(trigger_collection, competitor_id, page_id, max_ads)
    return JSONResponse({"received": True, "flow": "ad-intelligence", "competitor_id": competitor_id})


@app.post("/webhook/ad-intelligence")
@app.post("/api/webhook/ad-intelligence")
async def webhook_ad_intelligence(request: Request, background_tasks: BackgroundTasks):
    """
    Apify chama este endpoint quando o facebook-ads-scraper termina.
    Processa dataset em background: download, transcricao, analise, persistencia.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    # Log raw body for debugging
    logger.info(f"[webhook] /ad-intelligence raw body: {body}")

    # resource pode vir como string JSON (Apify template substitution) — parsear se necessario
    import json as _json
    resource = body.get("resource", {})
    if isinstance(resource, str):
        try:
            resource = _json.loads(resource)
        except Exception:
            logger.warning(f"[webhook] failed to parse resource string: {resource[:500]}")
            resource = {}
    body["resource"] = resource
    dataset_id = resource.get("defaultDatasetId") if isinstance(resource, dict) else None
    logger.info(f"[webhook] /ad-intelligence parsed — dataset={dataset_id}, resource_type={type(resource).__name__}")
    background_tasks.add_task(process_ad_intelligence_webhook, body)
    return JSONResponse({"received": True, "flow": "ad-intelligence"})


@app.post("/instagram/collect")
@app.post("/api/instagram/collect")
async def collect_instagram(request: Request):
    """
    Dispara coleta manual do Instagram via Apify usando webhooks do backend atual.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    direct_urls = body.get("directUrls") or body.get("urls") or []
    requested_actor_input = body.get("input") if isinstance(body.get("input"), dict) else None
    if isinstance(direct_urls, str):
        direct_urls = [direct_urls]

    normalized_direct_urls = [
        url.strip()
        for url in direct_urls
        if isinstance(url, str) and url.strip()
    ]

    if not normalized_direct_urls and not requested_actor_input:
        return JSONResponse(
            {"error": "directUrls ou input obrigatorio"},
            status_code=400,
        )

    actor_id = (body.get("actorId") or APIFY_ACTOR_ID or "").strip()
    if not actor_id:
        return JSONResponse(
            {"error": "APIFY_ACTOR_ID nao configurado no backend"},
            status_code=500,
        )

    backend_base_url = _resolve_backend_base_url(request, body.get("backendUrl"))
    if not backend_base_url:
        return JSONResponse(
            {"error": "Nenhum backend publico disponivel para receber os webhooks do Instagram"},
            status_code=500,
        )

    webhook_payload = body.get("webhookPayload") if isinstance(body.get("webhookPayload"), dict) else {}
    webhook_meta = dict(webhook_payload)
    for key in ("profile_id", "client_name", "own_instagram", "source", "custom_prompt", "scrape_recent_days"):
        if key not in webhook_meta and body.get(key) is not None:
            webhook_meta[key] = body.get(key)

    payload_template = _build_payload_template(webhook_meta)
    webhooks = [
        {
            "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
            "requestUrl": f"{backend_base_url}/webhook/estaticos",
            "payloadTemplate": payload_template,
        },
        {
            "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
            "requestUrl": f"{backend_base_url}/webhook/videos",
            "payloadTemplate": payload_template,
        },
        {
            "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
            "requestUrl": f"{backend_base_url}/webhook/carrossel",
            "payloadTemplate": payload_template,
        },
    ]
    webhooks_b64 = quote(base64.b64encode(json.dumps(webhooks).encode()).decode(), safe="")

    actor_input = requested_actor_input or {
        "directUrls": normalized_direct_urls,
        "resultsType": body.get("resultsType") or "posts",
        "resultsLimit": _safe_int(body.get("resultsLimit"), len(normalized_direct_urls)),
        "profile_id": body.get("profile_id"),
    }

    if "maxPostsPerUrl" in body:
        actor_input["maxPostsPerUrl"] = _safe_int(body.get("maxPostsPerUrl"), body.get("maxPostsPerUrl"))

    if "onlyPostsNewerThan" in body:
        actor_input["onlyPostsNewerThan"] = body.get("onlyPostsNewerThan")

    encoded_actor_id = quote(actor_id, safe="~")
    api_url = (
        f"https://api.apify.com/v2/acts/{encoded_actor_id}/runs"
        f"?token={APIFY_TOKEN}&webhooks={webhooks_b64}"
    )

    try:
        resp = await _client.post(
            api_url,
            headers={"Content-Type": "application/json"},
            json=actor_input,
        )
        data = resp.json() if resp.text.strip() else {}
        return JSONResponse(data, status_code=resp.status_code)
    except Exception as exc:
        logger.exception(f"[instagram] erro ao iniciar coleta: {exc}")
        return JSONResponse(
            {"error": "instagram_collect_failed", "detail": str(exc)},
            status_code=500,
        )


# ── TikTok ───────────────────────────────────────────────────────────────────

def _is_instagram_video_item(item: dict) -> bool:
    media_type = str(item.get("type") or item.get("mediaType") or "").strip().lower()
    return (
        media_type in {"video", "reel", "graphvideo", "clip"}
        or bool(item.get("videoUrl") or item.get("audioUrl") or item.get("downloadUrl"))
    )


@app.post("/instagram/resolve-urls")
@app.post("/api/instagram/resolve-urls")
async def resolve_instagram_urls(request: Request):
    """
    Resolve URLs recentes do Instagram via Apify sem gravar no Supabase.
    Usado pelo Transcritor para montar lotes a partir de perfis e periodo.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    requested_actor_input = body.get("input") if isinstance(body.get("input"), dict) else None
    direct_urls = body.get("directUrls") or body.get("urls") or []
    if isinstance(direct_urls, str):
        direct_urls = [direct_urls]

    normalized_direct_urls = [
        url.strip()
        for url in direct_urls
        if isinstance(url, str) and url.strip()
    ]

    if not normalized_direct_urls and not requested_actor_input:
        return JSONResponse(
            {"error": "directUrls ou input obrigatorio"},
            status_code=400,
        )

    actor_id = (body.get("actorId") or APIFY_ACTOR_ID or "").strip()
    if not actor_id:
        return JSONResponse({"error": "APIFY_ACTOR_ID nao configurado no backend"}, status_code=500)

    actor_input = requested_actor_input or {
        "directUrls": normalized_direct_urls,
        "resultsType": body.get("resultsType") or "posts",
        "resultsLimit": _safe_int(body.get("resultsLimit"), len(normalized_direct_urls) * 10),
    }

    if "maxPostsPerUrl" in body:
        actor_input["maxPostsPerUrl"] = _safe_int(body.get("maxPostsPerUrl"), body.get("maxPostsPerUrl"))
    if "onlyPostsNewerThan" in body:
        actor_input["onlyPostsNewerThan"] = body.get("onlyPostsNewerThan")

    encoded_actor_id = quote(actor_id, safe="~")
    api_url = (
        f"https://api.apify.com/v2/acts/{encoded_actor_id}/run-sync-get-dataset-items"
        f"?token={APIFY_TOKEN}&timeout=180"
    )

    try:
        resp = await _client.post(api_url, headers={"Content-Type": "application/json"}, json=actor_input)
        resp.raise_for_status()
        items = resp.json() if resp.text.strip() else []
        if not isinstance(items, list):
            items = []

        media_type_filter = str(body.get("mediaType") or "all").lower()
        urls: list[str] = []
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            if media_type_filter == "video" and not _is_instagram_video_item(item):
                continue
            post_url = normalize_post_url(item)
            if not post_url or post_url in seen:
                continue
            seen.add(post_url)
            urls.append(post_url)

        return JSONResponse({"urls": urls, "count": len(urls), "total_items": len(items)})
    except Exception as exc:
        logger.exception(f"[instagram] erro ao resolver URLs: {exc}")
        return JSONResponse(
            {"error": "instagram_resolve_urls_failed", "detail": str(exc)},
            status_code=500,
        )
@app.post("/tiktok/collect")
@app.post("/api/tiktok/collect")
async def collect_tiktok(request: Request):
    """
    Dispara coleta de TikTok via Apify (clockworks/tiktok-scraper).
    Body: {"profile_id": "uuid", "profiles": ["@user"], "max_videos": 12}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    profile_id = body.get("profile_id")
    profiles = body.get("profiles") or []
    video_urls = body.get("video_urls") or []
    max_videos = body.get("max_videos", 12)

    if not profile_id:
        return JSONResponse({"error": "profile_id required"}, status_code=400)
    if not profiles and not video_urls:
        return JSONResponse({"error": "profiles ou video_urls required"}, status_code=400)

    backend_base_url = _resolve_backend_base_url(request, body.get("backendUrl"))
    if not backend_base_url:
        return JSONResponse(
            {"error": "Nenhum backend publico disponivel para receber os webhooks do TikTok"},
            status_code=500,
        )

    webhook_meta = {
        "profile_id": profile_id,
        "client_name": body.get("client_name", ""),
        "source": body.get("source", ""),
    }
    payload_template = _build_payload_template(webhook_meta)
    webhooks = [{
        "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
        "requestUrl": f"{backend_base_url}/webhook/tiktok",
        "payloadTemplate": payload_template,
    }]
    webhooks_b64 = quote(base64.b64encode(json.dumps(webhooks).encode()).decode(), safe="")

    actor_input: dict = {"resultsPerPage": _safe_int(max_videos, 12)}
    if profiles:
        actor_input["profiles"] = profiles
    if video_urls:
        actor_input["postURLs"] = video_urls

    encoded_actor_id = quote(APIFY_TIKTOK_ACTOR_ID, safe="~")
    api_url = (
        f"https://api.apify.com/v2/acts/{encoded_actor_id}/runs"
        f"?token={APIFY_TOKEN}&webhooks={webhooks_b64}"
    )

    try:
        resp = await _client.post(
            api_url,
            headers={"Content-Type": "application/json"},
            json=actor_input,
        )
        data = resp.json() if resp.text.strip() else {}
        return JSONResponse(data, status_code=resp.status_code)
    except Exception as exc:
        logger.exception(f"[tiktok] erro ao iniciar coleta: {exc}")
        return JSONResponse(
            {"error": "tiktok_collect_failed", "detail": str(exc)},
            status_code=500,
        )


@app.post("/webhook/tiktok")
@app.post("/api/webhook/tiktok")
async def webhook_tiktok(request: Request, background_tasks: BackgroundTasks):
    """
    Apify chama este endpoint quando o tiktok-scraper termina.
    Processa dataset em background.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    import json as _json
    resource = body.get("resource", {})
    if isinstance(resource, str):
        try:
            resource = _json.loads(resource)
        except Exception:
            resource = {}
    body["resource"] = resource
    dataset_id = resource.get("defaultDatasetId") if isinstance(resource, dict) else None
    logger.info(f"[webhook] /tiktok recebido — dataset={dataset_id}")
    background_tasks.add_task(process_tiktok, body)
    return JSONResponse({"received": True, "flow": "tiktok"})


# ── YouTube ──────────────────────────────────────────────────────────────────
@app.post("/youtube/collect")
@app.post("/api/youtube/collect")
async def collect_youtube(request: Request):
    """
    Dispara coleta de YouTube via Apify (streamers/youtube-scraper).
    Body: {"channel_id": "uuid", "start_urls": ["https://youtube.com/@handle"], "max_videos": 10}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    channel_id = body.get("channel_id")
    start_urls = body.get("start_urls") or []
    video_urls = body.get("video_urls") or []
    max_videos = body.get("max_videos", 10)

    if not channel_id:
        return JSONResponse({"error": "channel_id required"}, status_code=400)
    if not start_urls and not video_urls:
        return JSONResponse({"error": "start_urls ou video_urls required"}, status_code=400)

    backend_base_url = _resolve_backend_base_url(request, body.get("backendUrl"))
    if not backend_base_url:
        return JSONResponse(
            {"error": "Nenhum backend publico disponivel para receber os webhooks do YouTube"},
            status_code=500,
        )

    webhook_meta = {
        "channel_id": channel_id,
        "client_name": body.get("client_name", ""),
        "source": body.get("source", ""),
    }
    payload_template = _build_payload_template(webhook_meta)
    webhooks = [{
        "eventTypes": ["ACTOR.RUN.SUCCEEDED"],
        "requestUrl": f"{backend_base_url}/webhook/youtube",
        "payloadTemplate": payload_template,
    }]
    webhooks_b64 = quote(base64.b64encode(json.dumps(webhooks).encode()).decode(), safe="")

    actor_input: dict = {"maxResults": _safe_int(max_videos, 10)}
    if start_urls:
        actor_input["startUrls"] = [{"url": u} for u in start_urls]
    if video_urls:
        actor_input["startUrls"] = (actor_input.get("startUrls") or []) + [{"url": u} for u in video_urls]

    encoded_actor_id = quote(APIFY_YOUTUBE_ACTOR_ID, safe="~")
    api_url = (
        f"https://api.apify.com/v2/acts/{encoded_actor_id}/runs"
        f"?token={APIFY_TOKEN}&webhooks={webhooks_b64}"
    )

    try:
        resp = await _client.post(
            api_url,
            headers={"Content-Type": "application/json"},
            json=actor_input,
        )
        data = resp.json() if resp.text.strip() else {}
        return JSONResponse(data, status_code=resp.status_code)
    except Exception as exc:
        logger.exception(f"[youtube] erro ao iniciar coleta: {exc}")
        return JSONResponse(
            {"error": "youtube_collect_failed", "detail": str(exc)},
            status_code=500,
        )


@app.post("/webhook/youtube")
@app.post("/api/webhook/youtube")
async def webhook_youtube(request: Request, background_tasks: BackgroundTasks):
    """
    Apify chama este endpoint quando o youtube-scraper termina.
    Processa dataset em background.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    import json as _json
    resource = body.get("resource", {})
    if isinstance(resource, str):
        try:
            resource = _json.loads(resource)
        except Exception:
            resource = {}
    body["resource"] = resource
    dataset_id = resource.get("defaultDatasetId") if isinstance(resource, dict) else None
    logger.info(f"[webhook] /youtube recebido — dataset={dataset_id}")
    background_tasks.add_task(process_youtube, body)
    return JSONResponse({"received": True, "flow": "youtube"})


@app.post("/roteiro/generate")
@app.post("/api/roteiro/generate")
async def roteiro_generate(request: Request):
    """
    Gera um roteiro de pauta quente usando sinais recentes do banco.
    Body: {"nicho": "...", "formato": "...", "persona": "...", "tom": "..."}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    nicho = (body.get("nicho") or "").strip()
    formato = (body.get("formato") or "video curto").strip()
    persona = (body.get("persona") or "").strip()
    tom = (body.get("tom") or "").strip()

    if not nicho:
        return JSONResponse({"error": "nicho required"}, status_code=400)

    try:
        result = await generate_roteiro(nicho, formato, persona, tom)
        return JSONResponse(result)
    except Exception as exc:
        logger.exception(f"[roteiro] erro ao gerar roteiro: {exc}")
        return JSONResponse(
            {"error": "roteiro_generation_failed", "detail": str(exc)},
            status_code=500,
        )


@app.post("/bestcontent/rank")
@app.post("/api/bestcontent/rank")
async def bestcontent_rank(request: Request):
    """
    Rankeia uma lista de posts e sugere a melhor adaptacao para a marca.
    Body: {"posts": [...], "marca_contexto": "..."}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    posts = body.get("posts") or []
    marca_contexto = (body.get("marca_contexto") or "").strip()

    if not isinstance(posts, list):
        return JSONResponse({"error": "posts must be a list"}, status_code=400)

    try:
        result = await rank_and_curate(posts, marca_contexto)
        return JSONResponse(result)
    except Exception as exc:
        logger.exception(f"[bestcontent] erro ao rankear posts: {exc}")
        return JSONResponse(
            {"error": "bestcontent_rank_failed", "detail": str(exc)},
            status_code=500,
        )


# ── Dev local ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
