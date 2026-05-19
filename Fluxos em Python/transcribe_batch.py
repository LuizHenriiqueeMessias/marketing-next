import asyncio
import contextlib
import html
import logging
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote, urlparse, urlunparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from config import (
    APIFY_ACTOR_ID,
    APIFY_INSTAGRAM_REEL_ACTOR_ID,
    APIFY_TIKTOK_ACTOR_ID,
    APIFY_TOKEN,
    APIFY_YOUTUBE_TRANSCRIPT_ACTOR_ID,
    CLAUDE_MODEL_VIDEOS,
    OPENROUTER_API_KEY,
    OPENROUTER_VISION_MODEL,
    SUPABASE_HEADERS,
    SUPABASE_SERVICE_KEY,
    SUPABASE_URL,
)
from utils import (
    _client,
    _transcribe_groq_auto,
    call_claude,
    fetch_apify_dataset,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transcribe", tags=["transcribe"])

ROTEIRO_TELEPROMPTER_SYSTEM = """
Voce e um especialista em adaptacao de roteiros para teleprompter.

Voce recebeu a transcricao de um video viral. O idioma original detectado foi: {detected_language}.

Sua tarefa e produzir um roteiro adaptado para PT-BR pronto para leitura em teleprompter.

REGRAS:

1. TRADUCAO (se necessario):
   - Se o idioma original NAO for portugues, traduza para portugues brasileiro natural e falado
   - Se JA for portugues, apenas corrija e formate - nao reescreva

2. PRESERVAR A ESTRUTURA VIRAL:
   - Este e um roteiro de conteudo que viralizou - o ritmo, as pausas dramaticas,
     os ganchos e a estrutura sao intencionais e sao o motivo do sucesso
   - Adaptar para portugues, NAO reescrever do zero
   - Nao resumir, nao condensar e nao omitir trechos importantes
   - Manter a mesma ordem de ideias, transicoes e ritmo do original
   - Manter expressoes de impacto com equivalentes naturais em portugues

3. CORRIGIR PARA COMUNICACAO ORAL:
   - A transcricao pode ter erros de speech-to-text - interprete a intencao
   - Corrigir frases quebradas ou sem sentido que sao artefatos da transcricao
   - Tornar o texto fluido como fala natural, nao como texto escrito

4. FORMATAR PARA TELEPROMPTER:
   - Linhas curtas (maximo 50-60 caracteres por linha)
   - Separar em blocos de 2-3 frases com linha em branco entre eles
   - Indicar pausas dramaticas com [...]
   - Indicar enfase com CAPS nas palavras-chave (max 2-3 por bloco)
   - Primeira linha = gancho (separado visualmente)
   - Ultimo bloco = CTA/fechamento (separado visualmente)

5. FORMATO DE SAIDA:
   Retorne APENAS o roteiro adaptado, sem explicacoes, sem comentarios, sem markdown.
   Comece direto com o texto do gancho.
   O roteiro deve cobrir a transcricao inteira, incluindo o CTA/fechamento final.
""".strip()

FINAL_ITEM_STATUSES = {"success", "error"}
RUNNING_ACTOR_STATUSES = {"READY", "RUNNING"}
TERMINAL_ACTOR_STATUSES = {"SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"}
INSTAGRAM_MEDIA_RETRY_STATUSES = {400, 403, 404, 408, 409, 416, 425, 429, 500, 502, 503, 504}
INSTAGRAM_MEDIA_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
ITEM_PROCESS_TIMEOUT_SECONDS = 900
YTDLP_DOWNLOAD_TIMEOUT_SECONDS = 180
PLATFORM_MAX_CONCURRENCY = {
    "instagram": 4,
    "tiktok": 2,
    "youtube": 4,
}
TELEPROMPTER_MIN_OUTPUT_TOKENS = 4000
TELEPROMPTER_MAX_OUTPUT_TOKENS = 16000
_background_batch_tasks: set[asyncio.Task[Any]] = set()


class BatchCreateRequest(BaseModel):
    urls: list[str] = Field(..., min_length=1, max_length=80)
    platform: Literal["instagram", "tiktok", "youtube"]
    user_id: str = Field(..., min_length=1)


def _normalize_input_urls(urls: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for raw_url in urls:
        if not isinstance(raw_url, str):
            continue

        candidate = raw_url.strip()
        if not candidate:
            continue

        lower = candidate.lower()
        if not lower.startswith(("http://", "https://")):
            if lower.startswith(("www.", "instagram.com", "tiktok.com", "www.tiktok.com", "vm.tiktok.com")):
                candidate = f"https://{candidate}"

        candidate = _strip_url_fragment(candidate)

        if candidate in seen:
            continue

        seen.add(candidate)
        normalized.append(candidate)

    return normalized


def _strip_url_fragment(url: str) -> str:
    if "#" not in url:
        return url

    parsed = urlparse(url)
    return urlunparse(parsed._replace(fragment=""))


def _get_hostname(url: str) -> str:
    parsed = urlparse(url)
    return (parsed.netloc or "").lower()


def _is_instagram_url(url: str) -> bool:
    hostname = _get_hostname(url)
    return hostname.endswith("instagram.com")


def _is_tiktok_url(url: str) -> bool:
    hostname = _get_hostname(url)
    return hostname.endswith("tiktok.com")


def _is_youtube_url(url: str) -> bool:
    hostname = _get_hostname(url)
    return hostname.endswith("youtube.com") or hostname == "youtu.be"


def _url_matches_platform(url: str, platform: str) -> bool:
    if platform == "instagram":
        return _is_instagram_url(url)
    if platform == "tiktok":
        return _is_tiktok_url(url)
    if platform == "youtube":
        return _is_youtube_url(url)
    return False


def _max_concurrency_for_platform(platform: str, total_items: int) -> int:
    platform_limit = PLATFORM_MAX_CONCURRENCY.get(platform, 3)
    return max(1, min(total_items, platform_limit))


def _coerce_single_record(payload: dict | list | None) -> dict:
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list) and payload:
        first = payload[0]
        return first if isinstance(first, dict) else {}
    return {}


def _extract_bearer_token(request: Request | None) -> str | None:
    if request is None:
        return None

    authorization = request.headers.get("authorization", "").strip()
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None

    clean_token = token.strip()
    return clean_token or None


def _resolve_supabase_headers(access_token: str | None = None) -> dict[str, str]:
    headers = dict(SUPABASE_HEADERS)
    if access_token and not SUPABASE_SERVICE_KEY.strip():
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _require_supabase_headers(access_token: str | None = None) -> dict[str, str]:
    if SUPABASE_SERVICE_KEY.strip():
        return _resolve_supabase_headers()
    if access_token:
        return _resolve_supabase_headers(access_token)

    raise HTTPException(
        status_code=401,
        detail="Sessao invalida para processar o lote. Faca login novamente ou configure SUPABASE_SERVICE_KEY no backend.",
    )


def _parse_supabase_json(response: httpx.Response) -> dict | list | None:
    try:
        return response.json()
    except Exception:
        return None


async def _supabase_select(path: str, headers: dict[str, str]) -> list[dict]:
    response = await _client.get(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
    )
    if response.status_code >= 400:
        logger.error("[transcribe_batch] Supabase select %s %s: %s", path, response.status_code, response.text)
        response.raise_for_status()

    payload = _parse_supabase_json(response)
    return payload if isinstance(payload, list) else []


async def _supabase_write_with_headers(
    method: str,
    path: str,
    body: dict,
    headers: dict[str, str],
) -> dict | list:
    response = await _client.request(
        method,
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers=headers,
        json=body,
    )
    if response.status_code >= 400:
        logger.error("[transcribe_batch] Supabase write %s %s %s: %s", method, path, response.status_code, response.text)
        response.raise_for_status()

    if not response.text.strip():
        return {}

    payload = _parse_supabase_json(response)
    return payload if payload is not None else {}


async def _supabase_insert_many(table: str, rows: list[dict], headers: dict[str, str]) -> list[dict]:
    if not rows:
        return []

    response = await _client.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers=headers,
        json=rows,
    )
    if response.status_code >= 400:
        logger.error("[transcribe_batch] %s %s: %s", table, response.status_code, response.text)
        response.raise_for_status()

    if not response.text.strip():
        return []

    payload = response.json()
    return payload if isinstance(payload, list) else []


def _track_background_task(task: asyncio.Task[Any]) -> None:
    _background_batch_tasks.add(task)

    def _cleanup(completed_task: asyncio.Task[Any]) -> None:
        _background_batch_tasks.discard(completed_task)
        try:
            completed_task.result()
        except Exception:
            logger.exception("[transcribe_batch] background batch task failed")

    task.add_done_callback(_cleanup)


async def _run_apify_actor(actor_id: str, actor_input: dict[str, Any], wait_seconds: int = 180) -> list[dict]:
    if not actor_id.strip():
        raise RuntimeError("Actor do Apify nao configurado para esta plataforma")

    encoded_actor_id = quote(actor_id.strip(), safe="~")
    run_url = (
        f"https://api.apify.com/v2/acts/{encoded_actor_id}/runs"
        f"?token={APIFY_TOKEN}&waitForFinish={wait_seconds}"
    )
    response = await _client.post(
        run_url,
        headers={"Content-Type": "application/json"},
        json=actor_input,
        timeout=float(max(wait_seconds + 60, 240)),
    )
    if response.status_code >= 400:
        logger.error("[transcribe_batch] Apify actor error %s: %s", response.status_code, response.text)
        response.raise_for_status()

    payload = response.json()
    run_data = payload.get("data") if isinstance(payload, dict) else {}
    if not isinstance(run_data, dict):
        raise RuntimeError("Resposta invalida do Apify ao iniciar actor")

    run_id = run_data.get("id")
    status = str(run_data.get("status") or "").upper()

    attempts = 0
    while run_id and status in RUNNING_ACTOR_STATUSES and attempts < 90:
        await asyncio.sleep(2)
        status_response = await _client.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}?token={APIFY_TOKEN}",
            timeout=60.0,
        )
        status_response.raise_for_status()
        status_payload = status_response.json()
        run_data = status_payload.get("data") if isinstance(status_payload, dict) else {}
        if not isinstance(run_data, dict):
            break
        status = str(run_data.get("status") or "").upper()
        attempts += 1

    if status not in TERMINAL_ACTOR_STATUSES:
        raise RuntimeError("Actor do Apify excedeu o tempo maximo de espera")
    if status != "SUCCEEDED":
        raise RuntimeError(f"Actor do Apify terminou com status {status}")

    dataset_id = run_data.get("defaultDatasetId")
    if not isinstance(dataset_id, str) or not dataset_id.strip():
        return []

    return await fetch_apify_dataset(dataset_id)


async def _fetch_instagram_post(url: str) -> dict:
    items = await _run_apify_actor(
        APIFY_ACTOR_ID,
        {
            "directUrls": [url],
            "resultsType": "posts",
            "resultsLimit": 1,
        },
    )
    for item in items:
        if isinstance(item, dict):
            return item
    raise RuntimeError("Nenhum post do Instagram foi retornado pelo Apify")


def _instagram_shortcode(url: str) -> str | None:
    parsed = urlparse(_strip_url_fragment(url))
    path_parts = [part for part in parsed.path.split("/") if part]
    if len(path_parts) < 2:
        return None

    if path_parts[0].lower() not in {"p", "reel", "tv"}:
        return None

    shortcode = path_parts[1].strip()
    return shortcode or None


def _instagram_reel_actor_url_candidates(url: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    shortcode = _instagram_shortcode(url)
    if shortcode:
        candidates.append(f"https://www.instagram.com/reel/{shortcode}/")

    candidates.append(_strip_url_fragment(url))

    deduped: list[str] = []
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)

    return deduped


async def _fetch_instagram_reel_items(url: str) -> list[dict]:
    if not APIFY_INSTAGRAM_REEL_ACTOR_ID.strip():
        return []

    last_error: Exception | None = None
    for candidate_url in _instagram_reel_actor_url_candidates(url):
        try:
            items = await _run_apify_actor(
                APIFY_INSTAGRAM_REEL_ACTOR_ID,
                {
                    "username": [candidate_url],
                    "resultsLimit": 1,
                    "includeTranscript": True,
                    "includeDownloadedVideo": False,
                },
                wait_seconds=240,
            )
        except Exception as exc:
            last_error = exc
            logger.warning(
                "[transcribe_batch] Instagram Reel actor fallback failed url=%s: %s",
                candidate_url,
                _describe_download_error(exc),
            )
            continue

        if items:
            return [item for item in items if isinstance(item, dict)]

    if last_error:
        raise last_error

    return []


def _get_value_by_path(source: dict[str, Any], path: str) -> Any:
    current: Any = source
    for segment in path.split("."):
        if isinstance(current, dict):
            current = current.get(segment)
            continue
        if isinstance(current, list):
            try:
                current = current[int(segment)]
                continue
            except (ValueError, IndexError):
                return None
        return None
    return current


def _pick_first(source: dict[str, Any], paths: list[str]) -> Any:
    for path in paths:
        value = _get_value_by_path(source, path)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _normalize_text_block(value: str) -> str:
    return (
        value.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\t", " ")
        .strip()
    )


def _format_subtitle_timestamp(value: Any) -> str | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        total_seconds = max(0, int(value))
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        if hours > 0:
            return f"{hours}:{minutes:02d}:{seconds:02d}"
        return f"{minutes}:{seconds:02d}"

    if isinstance(value, str) and value.strip():
        return value.strip()

    return None


def _format_subtitles(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return _normalize_text_block(value)

    if not isinstance(value, list) or not value:
        return None

    lines: list[str] = []
    for entry in value:
        if not isinstance(entry, dict):
            continue

        text = _pick_first(entry, ["text", "content", "subtitle", "caption", "line"])
        if not isinstance(text, str) or not text.strip():
            continue

        start = _format_subtitle_timestamp(
            _pick_first(entry, ["start", "startTime", "offset", "time", "timestamp"])
        )
        line = text.strip()
        lines.append(f"[{start}] {line}" if start else line)

    if not lines:
        return None

    return _normalize_text_block("\n".join(lines))


def _format_transcript_payload(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return _normalize_text_block(value)

    if isinstance(value, list):
        text_lines = [str(item).strip() for item in value if isinstance(item, str) and item.strip()]
        if text_lines:
            return _normalize_text_block("\n".join(text_lines))
        return _format_subtitles(value)

    if isinstance(value, dict):
        text = _pick_first(
            value,
            ["text", "content", "transcript", "transcription", "plaintext", "plainText", "captions", "segments"],
        )
        if isinstance(text, str) and text.strip():
            return _normalize_text_block(text)
        if isinstance(text, list):
            return _format_subtitles(text)

    return None


def _extract_instagram_transcript(raw_item: dict[str, Any]) -> dict[str, str] | None:
    for path in [
        "transcript",
        "transcription",
        "transcriptText",
        "transcriptionText",
        "videoTranscript",
        "audioTranscript",
        "subtitles",
        "captions",
    ]:
        transcript_text = _format_transcript_payload(_get_value_by_path(raw_item, path))
        if transcript_text:
            language = _pick_first(
                raw_item,
                [
                    "transcriptLanguage",
                    "transcriptionLanguage",
                    "language",
                    "audioLanguage",
                    f"{path}.language",
                    f"{path}.languageCode",
                    f"{path}.lang",
                ],
            )
            return {
                "text": transcript_text,
                "language": str(language or "unknown").strip().lower() or "unknown",
            }

    return None


def _filename_from_url(url: str, default: str) -> str:
    parsed = urlparse(url)
    filename = Path(parsed.path).name
    return filename or default


def _normalize_media_url(url: str) -> str:
    return html.unescape(url.strip().replace("\\u0026", "&").replace("\\/", "/"))


def _add_media_url_candidate(candidates: list[str], seen: set[str], value: Any) -> None:
    if isinstance(value, str):
        media_url = _normalize_media_url(value)
        if not media_url.startswith(("http://", "https://")):
            return
        if media_url in seen:
            return
        seen.add(media_url)
        candidates.append(media_url)
        return

    if isinstance(value, list):
        for item in value:
            _add_media_url_candidate(candidates, seen, item)
        return

    if isinstance(value, dict):
        for key in [
            "url",
            "urlList",
            "UrlList",
            "DownloadAddr",
            "downloadAddr",
            "download_addr",
            "downloadUrl",
            "downloadURL",
            "downloadedVideoUrl",
            "downloadedMediaUrl",
            "PlayAddr",
            "playAddr",
            "play_addr",
            "videoUrl",
            "mediaUrl",
            "fileUrl",
        ]:
            _add_media_url_candidate(candidates, seen, value.get(key))


def _instagram_media_url_candidates(post: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    for path in [
        "downloadedVideoUrl",
        "downloadedMediaUrl",
        "downloadedVideo",
        "downloadedMedia",
        "video.downloadUrl",
        "video.url",
        "audioUrl",
        "videoUrl",
        "downloadUrl",
        "mediaUrl",
    ]:
        value = _get_value_by_path(post, path)
        _add_media_url_candidate(candidates, seen, value)

    return candidates


def _instagram_media_headers(source_url: str, use_range: bool = False) -> dict[str, str]:
    referer = _strip_url_fragment(source_url).strip() or "https://www.instagram.com/"
    if not _is_instagram_url(referer):
        referer = "https://www.instagram.com/"

    headers = {
        "User-Agent": INSTAGRAM_MEDIA_USER_AGENT,
        "Accept": "video/mp4,video/*;q=0.9,audio/*;q=0.8,*/*;q=0.7",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": referer,
    }
    if use_range:
        headers["Range"] = "bytes=0-"

    return headers


def _describe_download_error(error: Exception) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        request_url = str(error.request.url) if error.request else ""
        host = urlparse(request_url).netloc or "origem remota"
        return f"HTTP {error.response.status_code} em {host}"

    message = str(error).strip()
    return message or error.__class__.__name__


def _is_retryable_instagram_media_error(error: Exception) -> bool:
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in INSTAGRAM_MEDIA_RETRY_STATUSES
    return isinstance(error, (httpx.TimeoutException, httpx.TransportError))


async def _download_binary(
    url: str,
    default_filename: str,
    headers: dict[str, str] | None = None,
) -> tuple[bytes, str]:
    response = await _client.get(url, headers=headers, follow_redirects=True, timeout=240.0)
    response.raise_for_status()
    return response.content, _filename_from_url(url, default_filename)


async def _download_instagram_media(
    media_url: str,
    source_url: str,
    default_filename: str,
) -> tuple[bytes, str]:
    header_variants = [
        _instagram_media_headers(source_url),
        _instagram_media_headers(source_url, use_range=True),
        _instagram_media_headers("https://www.instagram.com/", use_range=True),
    ]
    last_error: Exception | None = None

    for headers in header_variants:
        try:
            return await _download_binary(media_url, default_filename, headers=headers)
        except Exception as exc:
            last_error = exc
            if not _is_retryable_instagram_media_error(exc):
                raise

    if last_error:
        raise last_error

    raise RuntimeError("Nao foi possivel baixar a midia do Instagram")


async def _fetch_instagram_media(url: str, attempts: int = 1) -> tuple[bytes, str]:
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            post = await _fetch_instagram_post(url)
            media_urls = _instagram_media_url_candidates(post)
            if not media_urls:
                raise RuntimeError("O post do Instagram nao possui audio ou video disponivel para transcricao")

            media_error: Exception | None = None
            for media_url in media_urls:
                try:
                    return await _download_instagram_media(media_url, url, "instagram-audio.mp4")
                except Exception as exc:
                    media_error = exc
                    if not _is_retryable_instagram_media_error(exc):
                        raise

            if media_error:
                raise media_error

            raise RuntimeError("Nao foi possivel baixar a midia do Instagram")
        except Exception as exc:
            last_error = exc
            if not _is_retryable_instagram_media_error(exc):
                raise
            if attempt >= attempts:
                break

            logger.warning(
                "[transcribe_batch] retrying Instagram media fetch url=%s attempt=%s/%s after %s",
                url,
                attempt + 1,
                attempts,
                _describe_download_error(exc),
            )
            await asyncio.sleep(min(2 * attempt, 8))

    if last_error:
        raise RuntimeError(
            "Falha ao baixar a midia do Instagram apos "
            f"{attempts} tentativas: {_describe_download_error(last_error)}"
        ) from last_error

    raise RuntimeError("Falha ao baixar a midia do Instagram")


async def _communicate_subprocess(
    process: asyncio.subprocess.Process,
    timeout_seconds: int,
    tool_name: str,
) -> tuple[bytes, bytes]:
    try:
        return await asyncio.wait_for(process.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError as exc:
        with contextlib.suppress(ProcessLookupError):
            process.kill()
        with contextlib.suppress(Exception):
            await process.communicate()
        raise RuntimeError(f"{tool_name} excedeu {timeout_seconds}s sem finalizar") from exc
    except asyncio.CancelledError:
        with contextlib.suppress(ProcessLookupError):
            process.kill()
        with contextlib.suppress(Exception):
            await process.communicate()
        raise


async def _download_with_ytdlp(
    url: str,
    format_selector: str,
    default_prefix: str,
    extra_args: list[str] | None = None,
) -> tuple[bytes, str]:
    with tempfile.TemporaryDirectory(prefix="transcribe-batch-") as temp_dir:
        output_template = str(Path(temp_dir) / f"{default_prefix}.%(ext)s")
        command = [
            sys.executable,
            "-m",
            "yt_dlp",
            "-f",
            format_selector,
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "--socket-timeout",
            "30",
            "--retries",
            "2",
            "--fragment-retries",
            "2",
            "-o",
            output_template,
        ]
        if extra_args:
            command.extend(extra_args)
        command.append(url)

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await _communicate_subprocess(
            process,
            YTDLP_DOWNLOAD_TIMEOUT_SECONDS,
            "yt-dlp",
        )
        if process.returncode != 0:
            error_output = stderr.decode("utf-8", errors="ignore").strip() or stdout.decode("utf-8", errors="ignore").strip()
            raise RuntimeError(error_output or "Falha ao baixar midia com yt-dlp")

        media_files = sorted(
            path
            for path in Path(temp_dir).glob(f"{default_prefix}.*")
            if path.is_file() and not path.name.endswith((".part", ".ytdl"))
        )
        if not media_files:
            raise RuntimeError("yt-dlp nao gerou arquivo de midia para o video")

        media_path = media_files[0]
        return media_path.read_bytes(), media_path.name


async def _download_instagram_with_ytdlp(url: str) -> tuple[bytes, str]:
    return await _download_with_ytdlp(
        url,
        "bestaudio[ext=m4a]/bestaudio/best[ext=mp4]/best",
        "instagram",
        extra_args=[
            "--user-agent",
            INSTAGRAM_MEDIA_USER_AGENT,
            "--referer",
            "https://www.instagram.com/",
        ],
    )


def _fallback_teleprompter_script(transcricao_original: str) -> str:
    cleaned = _normalize_text_block(transcricao_original)
    if not cleaned:
        return ""

    chunks = re.split(r"(?<=[.!?])\s+|\n+", cleaned)
    lines: list[str] = []
    for chunk in chunks:
        words = chunk.strip().split()
        if not words:
            continue

        current_line = ""
        for word in words:
            candidate = f"{current_line} {word}".strip()
            if current_line and len(candidate) > 58:
                lines.append(current_line)
                current_line = word
            else:
                current_line = candidate
        if current_line:
            lines.append(current_line)
        lines.append("")

    return "\n".join(lines).strip()


def _extract_openrouter_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        return ""

    message = first_choice.get("message")
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for entry in content:
            if not isinstance(entry, dict):
                continue
            text = entry.get("text") or entry.get("content")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
        return "\n".join(parts).strip()

    return ""


def _estimate_teleprompter_output_tokens(transcricao_original: str) -> int:
    estimated = (len(transcricao_original) // 3) + 1200
    return max(
        TELEPROMPTER_MIN_OUTPUT_TOKENS,
        min(TELEPROMPTER_MAX_OUTPUT_TOKENS, estimated),
    )


async def _call_openrouter_teleprompter(system_prompt: str, user_message: str, max_tokens: int) -> str:
    if not OPENROUTER_API_KEY.strip():
        raise RuntimeError("OPENROUTER_API_KEY nao configurada")

    response = await _client.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENROUTER_VISION_MODEL,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        },
        timeout=240.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"OpenRouter recusou o roteiro: HTTP {response.status_code} {response.text[:300]}")

    text = _extract_openrouter_text(response.json())
    if not text:
        raise RuntimeError("OpenRouter nao retornou texto para o roteiro")

    return text


async def _generate_teleprompter_script(
    transcricao_original: str,
    detected_language: str,
    url: str,
) -> str:
    language = detected_language or "unknown"
    system_prompt = ROTEIRO_TELEPROMPTER_SYSTEM.format(detected_language=language)
    user_message = (
        f"IDIOMA DETECTADO: {language}\n\n"
        f"TRANSCRICAO ORIGINAL:\n{transcricao_original}\n\n"
        f"URL DE REFERENCIA: {url}"
    )
    max_tokens = _estimate_teleprompter_output_tokens(transcricao_original)
    try:
        return (
            await call_claude(
                system=system_prompt,
                user_message=user_message,
                model=CLAUDE_MODEL_VIDEOS,
                max_tokens=max_tokens,
            )
        ).strip()
    except Exception as exc:
        logger.warning(
            "[transcribe_batch] Claude indisponivel para roteiro url=%s: %s",
            url,
            exc,
        )

    try:
        return (await _call_openrouter_teleprompter(system_prompt, user_message, max_tokens)).strip()
    except Exception as exc:
        logger.warning(
            "[transcribe_batch] OpenRouter indisponivel para roteiro url=%s: %s",
            url,
            exc,
        )
        return _fallback_teleprompter_script(transcricao_original)


async def _build_instagram_result(
    transcricao_original: str,
    detected_language: str,
    url: str,
) -> dict[str, str]:
    clean_transcricao = transcricao_original.strip()
    clean_language = detected_language.strip() or "unknown"
    if not clean_transcricao:
        raise RuntimeError("Nao foi retornado texto para o video do Instagram")

    return {
        "detected_language": clean_language,
        "transcricao_original": clean_transcricao,
        "roteiro_adaptado": await _generate_teleprompter_script(clean_transcricao, clean_language, url),
    }


async def _transcribe_instagram_media(audio_bytes: bytes, filename: str, url: str) -> dict[str, str]:
    transcription = await _transcribe_groq_auto(audio_bytes, filename=filename)
    transcricao_original = str(transcription.get("text") or "").strip()
    detected_language = str(transcription.get("language") or "unknown").strip() or "unknown"
    if not transcricao_original:
        raise RuntimeError("O Whisper nao retornou texto para o video do Instagram")

    return await _build_instagram_result(transcricao_original, detected_language, url)


async def _process_instagram_reel_actor_fallback(url: str) -> dict[str, str] | None:
    items = await _fetch_instagram_reel_items(url)
    if not items:
        return None

    for item in items:
        transcript_payload = _extract_instagram_transcript(item)
        if not transcript_payload:
            continue

        return await _build_instagram_result(
            transcript_payload["text"],
            transcript_payload["language"],
            url,
        )

    last_media_error: Exception | None = None
    for item in items:
        for media_url in _instagram_media_url_candidates(item):
            try:
                audio_bytes, filename = await _download_instagram_media(media_url, url, "instagram-reel.mp4")
                return await _transcribe_instagram_media(audio_bytes, filename, url)
            except Exception as exc:
                last_media_error = exc
                if not _is_retryable_instagram_media_error(exc):
                    raise

    if last_media_error:
        raise last_media_error

    return None


async def _process_instagram_url(url: str) -> dict[str, str]:
    fallback_errors: list[str] = []

    try:
        reel_result = await _process_instagram_reel_actor_fallback(url)
        if reel_result:
            return reel_result
    except Exception as exc:
        fallback_errors.append(f"reel_actor={_describe_download_error(exc)}")
        logger.warning(
            "[transcribe_batch] Instagram Reel actor transcript failed url=%s: %s",
            url,
            _describe_download_error(exc),
        )

    try:
        audio_bytes, filename = await _fetch_instagram_media(url)
        return await _transcribe_instagram_media(audio_bytes, filename, url)
    except Exception as exc:
        fallback_errors.append(f"cdn={_describe_download_error(exc)}")
        logger.warning(
            "[transcribe_batch] Instagram CDN download failed url=%s: %s",
            url,
            _describe_download_error(exc),
        )

    try:
        audio_bytes, filename = await _download_instagram_with_ytdlp(url)
        return await _transcribe_instagram_media(audio_bytes, filename, url)
    except Exception as exc:
        fallback_errors.append(f"yt_dlp={_describe_download_error(exc)}")

    raise RuntimeError("Falha ao baixar/transcrever Instagram: " + "; ".join(fallback_errors))


def _extract_tiktok_transcript(raw_item: dict[str, Any]) -> dict[str, str] | None:
    for path in [
        "transcript",
        "transcription",
        "transcriptText",
        "transcriptionText",
        "videoTranscript",
        "audioTranscript",
        "subtitles",
        "captions",
        "subtitleInfos",
        "videoMeta.subtitles",
        "video.subtitles",
        "video.captions",
    ]:
        transcript_text = _format_transcript_payload(_get_value_by_path(raw_item, path))
        if transcript_text:
            language = _pick_first(
                raw_item,
                [
                    "transcriptLanguage",
                    "transcriptionLanguage",
                    "subtitleLanguage",
                    "language",
                    "lang",
                    f"{path}.language",
                    f"{path}.languageCode",
                    f"{path}.lang",
                ],
            )
            return {
                "text": transcript_text,
                "language": str(language or "unknown").strip().lower() or "unknown",
            }

    return None


async def _fetch_tiktok_apify_item(url: str) -> dict[str, Any]:
    items = await _run_apify_actor(
        APIFY_TIKTOK_ACTOR_ID,
        {
            "postURLs": [url],
            "resultsPerPage": 1,
        },
        wait_seconds=240,
    )
    for item in items:
        if isinstance(item, dict):
            return item
    raise RuntimeError("Nenhum video do TikTok foi retornado pelo Apify")


def _is_tiktok_watch_page(url: str) -> bool:
    parsed = urlparse(url)
    return (parsed.netloc or "").lower().endswith("tiktok.com") and "/video/" in parsed.path.lower()


def _tiktok_media_url_candidates(item: dict[str, Any]) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    for path in [
        "downloadedVideoUrl",
        "downloadedMediaUrl",
        "downloadUrl",
        "videoUrl",
        "mediaUrl",
        "videoMeta.downloadAddr",
        "videoMeta.playAddr",
        "videoMeta.url",
        "videoMeta.bitrateInfo",
        "video.downloadAddr",
        "video.playAddr",
        "video.url",
        "video.bitrateInfo",
    ]:
        value = _get_value_by_path(item, path)
        _add_media_url_candidate(candidates, seen, value)

    return [candidate for candidate in candidates if not _is_tiktok_watch_page(candidate)]


def _tiktok_media_headers(source_url: str) -> dict[str, str]:
    referer = _strip_url_fragment(source_url).strip() or "https://www.tiktok.com/"
    if not _is_tiktok_url(referer):
        referer = "https://www.tiktok.com/"

    return {
        "User-Agent": INSTAGRAM_MEDIA_USER_AGENT,
        "Accept": "video/mp4,video/*;q=0.9,audio/*;q=0.8,*/*;q=0.7",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": referer,
    }


async def _download_tiktok_media(media_url: str, source_url: str) -> tuple[bytes, str]:
    audio_bytes, filename = await _download_binary(
        media_url,
        "tiktok.mp4",
        headers=_tiktok_media_headers(source_url),
    )
    if "." not in Path(filename).name:
        filename = "tiktok.mp4"
    return audio_bytes, filename


async def _build_tiktok_result(
    transcricao_original: str,
    detected_language: str,
    url: str,
) -> dict[str, str]:
    clean_transcricao = transcricao_original.strip()
    clean_language = detected_language.strip() or "unknown"
    if not clean_transcricao:
        raise RuntimeError("Nao foi retornado texto para o video do TikTok")

    return {
        "detected_language": clean_language,
        "transcricao_original": clean_transcricao,
        "roteiro_adaptado": await _generate_teleprompter_script(clean_transcricao, clean_language, url),
    }


async def _transcribe_tiktok_media(audio_bytes: bytes, filename: str, url: str) -> dict[str, str]:
    transcription = await _transcribe_groq_auto(audio_bytes, filename=filename)
    transcricao_original = str(transcription.get("text") or "").strip()
    detected_language = str(transcription.get("language") or "unknown").strip() or "unknown"
    if not transcricao_original:
        raise RuntimeError("Whisper nao retornou texto para o video do TikTok")

    return await _build_tiktok_result(transcricao_original, detected_language, url)


async def _process_tiktok_apify_url(url: str) -> dict[str, str]:
    item = await _fetch_tiktok_apify_item(url)

    transcript_payload = _extract_tiktok_transcript(item)
    if transcript_payload:
        return await _build_tiktok_result(
            transcript_payload["text"],
            transcript_payload["language"],
            url,
        )

    media_errors: list[str] = []
    for media_url in _tiktok_media_url_candidates(item):
        try:
            audio_bytes, filename = await _download_tiktok_media(media_url, url)
            return await _transcribe_tiktok_media(audio_bytes, filename, url)
        except Exception as exc:
            media_errors.append(_describe_download_error(exc))

    detail = "; ".join(media_errors) if media_errors else "sem URL direta de video/audio no dataset"
    raise RuntimeError(f"Apify retornou o TikTok, mas nao foi possivel extrair audio/transcricao: {detail}")


_TIKTOK_FORMAT_CANDIDATES = [
    "bestaudio[acodec!=none]",
    "best[acodec!=none][vcodec!=none]",
    "best[acodec!=none]",
]


async def _process_tiktok_url(url: str) -> dict[str, str]:
    """Fetch TikTok via Apify first, then fall back to yt-dlp + Whisper."""
    # Detect photo/slideshow URLs — these have no audio to transcribe
    clean_url = url.split("?")[0].rstrip("/").lower()
    if "/photo/" in clean_url or "/slideshow/" in clean_url:
        raise RuntimeError(
            "Este link e de uma foto/slideshow do TikTok, nao de um video. "
            "O transcritor so funciona com videos que tenham audio."
        )

    fallback_errors: list[str] = []
    try:
        return await _process_tiktok_apify_url(url)
    except Exception as exc:
        fallback_errors.append(f"apify={_describe_download_error(exc)}")
        logger.warning(
            "[transcribe_batch] TikTok Apify path failed url=%s: %s",
            url,
            _describe_download_error(exc),
        )

    last_error: Exception | None = None
    for format_selector in _TIKTOK_FORMAT_CANDIDATES:
        try:
            audio_bytes, filename = await _download_with_ytdlp(url, format_selector, "tiktok")
        except Exception as exc:
            error_str = str(exc)
            if "Unsupported URL" in error_str and "/photo/" in error_str:
                raise RuntimeError(
                    "Este link e de uma foto/slideshow do TikTok, nao de um video. "
                    "O transcritor so funciona com videos que tenham audio."
                ) from exc
            if "Requested format is not available" in error_str:
                last_error = exc
                continue
            last_error = exc
            logger.warning(
                "[transcribe_batch] TikTok yt-dlp format=%s failed: %s",
                format_selector,
                _describe_download_error(exc),
            )
            continue

        try:
            transcription = await _transcribe_groq_auto(audio_bytes, filename=filename)
        except Exception as exc:
            # Sem faixa de audio nesse formato — tenta o proximo seletor
            if "no audio track" in str(exc).lower():
                last_error = exc
                logger.warning(
                    "[transcribe_batch] TikTok format=%s sem audio, tentando proximo seletor",
                    format_selector,
                )
                continue
            raise

        transcricao_original = str(transcription.get("text") or "").strip()
        detected_language = str(transcription.get("language") or "unknown").strip() or "unknown"
        if not transcricao_original:
            raise RuntimeError("Whisper nao retornou texto para o video do TikTok")
        return {
            "detected_language": detected_language,
            "transcricao_original": transcricao_original,
            "roteiro_adaptado": await _generate_teleprompter_script(transcricao_original, detected_language, url),
        }

    if last_error:
        raise RuntimeError(
            "Nenhum formato do TikTok com audio utilizavel foi encontrado. "
            f"Tentativas: {'; '.join(fallback_errors + [f'yt_dlp={_describe_download_error(last_error)}'])}"
        ) from last_error
    detail = "; ".join(fallback_errors) if fallback_errors else "sem detalhes adicionais"
    raise RuntimeError(f"Nenhum formato do TikTok com audio utilizavel foi encontrado. Tentativas: {detail}")


async def _download_youtube_subtitles_only(url: str) -> dict[str, str] | None:
    """Download auto-generated subtitles via yt-dlp without downloading audio/video.
    Passes mediaconnect player client to try bypassing bot detection."""
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            out_template = str(Path(tmpdir) / "subs")
            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--skip-download",
                "--write-auto-subs",
                "--sub-langs", "pt,en",
                "--sub-format", "srv1",
                "--no-warnings",
                "--quiet",
                "--extractor-args", "youtube:player_client=mediaconnect",
                "-o", out_template,
                url,
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await _communicate_subprocess(proc, 90, "yt-dlp subtitles")

            sub_file = None
            detected_lang = "unknown"
            for lang in ["pt", "en"]:
                candidate = Path(tmpdir) / f"subs.{lang}.srv1"
                if candidate.exists() and candidate.stat().st_size > 0:
                    sub_file = candidate
                    detected_lang = lang
                    break
            if not sub_file:
                for f in Path(tmpdir).glob("*.srv1"):
                    if f.stat().st_size > 0:
                        sub_file = f
                        detected_lang = f.stem.split(".")[-1] if "." in f.stem else "unknown"
                        break
            if not sub_file:
                return None

            raw_xml = sub_file.read_text(encoding="utf-8")
            lines = []
            for match in re.finditer(r"<text[^>]*>(.*?)</text>", raw_xml, re.DOTALL):
                text = (
                    match.group(1).strip()
                    .replace("&amp;", "&")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&#39;", "'")
                    .replace("&quot;", '"')
                )
                if text:
                    lines.append(text)

            if lines:
                return {"text": " ".join(lines), "language": detected_lang}
    except Exception as exc:
        logger.warning(f"[transcribe_batch] yt-dlp subtitle-only failed: {exc}")
    return None


async def _fetch_youtube_transcript_api(url: str) -> dict[str, str] | None:
    """Fetch transcript using youtube-transcript-api (YouTube internal API).
    Uses a different endpoint than yt-dlp and may bypass bot detection."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from urllib.parse import parse_qs

        parsed = urlparse(url)
        video_id = None
        host = (parsed.hostname or "").lower()
        if host == "youtu.be":
            video_id = parsed.path.lstrip("/")
        elif host.endswith("youtube.com"):
            if parsed.path.startswith("/shorts/"):
                video_id = parsed.path.split("/shorts/", 1)[1].split("/")[0]
            else:
                video_id = parse_qs(parsed.query).get("v", [None])[0]
        if not video_id:
            return None

        def _fetch():
            ytt = YouTubeTranscriptApi()
            last_exc: Exception | None = None
            for lang_codes in [["pt"], ["en"], None]:
                try:
                    transcript = (
                        ytt.fetch(video_id, languages=lang_codes)
                        if lang_codes
                        else ytt.fetch(video_id)
                    )
                    text = " ".join(snippet.text for snippet in transcript)
                    if text.strip():
                        lang = getattr(transcript, "language_code", None) or (lang_codes[0] if lang_codes else "unknown")
                        return {"text": text.strip(), "language": lang}
                except Exception as exc:
                    last_exc = exc
                    continue
            if last_exc:
                raise last_exc
            return None

        return await asyncio.get_event_loop().run_in_executor(None, _fetch)
    except Exception as exc:
        # Re-raise so caller can distinguish "no transcript" from "IP blocked"
        raise RuntimeError(f"{type(exc).__name__}: {str(exc)[:200]}") from exc


async def _fetch_youtube_transcript_apify(url: str) -> dict[str, str] | None:
    """Fetch transcript via Apify actor (bypasses IP blocks by using Apify's
    rotating infrastructure). Uses run-sync-get-dataset-items to wait for
    completion and return dataset directly."""
    encoded_actor_id = quote(APIFY_YOUTUBE_TRANSCRIPT_ACTOR_ID, safe="~")
    api_url = (
        f"https://api.apify.com/v2/acts/{encoded_actor_id}/run-sync-get-dataset-items"
        f"?token={APIFY_TOKEN}"
    )
    payload = {
        "urls": [{"url": url}],
        "outputFormat": "json",
        "languages": ["pt", "en"],
        "preserveFormatting": False,
    }
    resp = await _client.post(
        api_url,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=180,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    items = resp.json() if resp.text.strip() else []
    if not isinstance(items, list) or not items:
        return None

    item = items[0]
    if not isinstance(item, dict):
        return None

    transcript = item.get("transcript")
    if not isinstance(transcript, list) or not transcript:
        return None

    lines: list[str] = []
    for snippet in transcript:
        if isinstance(snippet, dict):
            text = snippet.get("text")
            if isinstance(text, str) and text.strip():
                lines.append(text.strip())

    if not lines:
        return None

    lang = str(item.get("languageCode") or "unknown").strip() or "unknown"
    return {"text": " ".join(lines), "language": lang}


async def _process_youtube_url(url: str) -> dict[str, str]:
    errors: list[str] = []

    # Step 1: yt-dlp subtitle-only (works locally; often blocked on Render)
    try:
        subs = await _download_youtube_subtitles_only(url)
        if subs and subs.get("text"):
            detected_language = subs["language"]
            transcricao_original = subs["text"]
            return {
                "detected_language": detected_language,
                "transcricao_original": transcricao_original,
                "roteiro_adaptado": await _generate_teleprompter_script(transcricao_original, detected_language, url),
            }
        errors.append("yt-dlp=sem legendas")
    except Exception as exc:
        errors.append(f"yt-dlp={exc}")

    # Step 2: youtube-transcript-api (internal YouTube API, different endpoint)
    try:
        api_result = await _fetch_youtube_transcript_api(url)
        if api_result and api_result.get("text"):
            detected_language = api_result["language"]
            transcricao_original = api_result["text"]
            return {
                "detected_language": detected_language,
                "transcricao_original": transcricao_original,
                "roteiro_adaptado": await _generate_teleprompter_script(transcricao_original, detected_language, url),
            }
        errors.append("yt-transcript-api=sem legendas")
    except Exception as exc:
        errors.append(f"yt-transcript-api={exc}")

    # Step 3: Apify transcript actor (rotating IPs, bypasses bot detection)
    try:
        apify_result = await _fetch_youtube_transcript_apify(url)
        if apify_result and apify_result.get("text"):
            detected_language = apify_result["language"]
            transcricao_original = apify_result["text"]
            return {
                "detected_language": detected_language,
                "transcricao_original": transcricao_original,
                "roteiro_adaptado": await _generate_teleprompter_script(transcricao_original, detected_language, url),
            }
        errors.append("apify=sem legendas no dataset")
    except Exception as exc:
        errors.append(f"apify={str(exc)[:200]}")

    raise RuntimeError(
        "Nao foi possivel transcrever este video do YouTube. "
        "Tentativas: " + "; ".join(errors) + ". "
        "O video pode nao ter legendas disponiveis."
    )


async def _process_item(platform: str, url: str) -> dict[str, str]:
    if platform == "instagram":
        return await _process_instagram_url(url)
    if platform == "tiktok":
        return await _process_tiktok_url(url)
    if platform == "youtube":
        return await _process_youtube_url(url)
    raise RuntimeError(f"Plataforma nao suportada: {platform}")


async def _patch_batch_progress(
    batch_id: str,
    completed_items: int,
    status: str,
    supabase_headers: dict[str, str],
) -> None:
    await _supabase_write_with_headers(
        "PATCH",
        f"transcription_batches?id=eq.{batch_id}",
        {
            "completed_items": completed_items,
            "status": status,
        },
        supabase_headers,
    )


async def _patch_item_success(
    item_id: str,
    payload: dict[str, str],
    supabase_headers: dict[str, str],
) -> None:
    await _supabase_write_with_headers(
        "PATCH",
        f"transcription_items?id=eq.{item_id}",
        {
            "status": "success",
            "detected_language": payload["detected_language"],
            "transcricao_original": payload["transcricao_original"],
            "roteiro_adaptado": payload["roteiro_adaptado"],
            "error_message": None,
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
        supabase_headers,
    )


async def _patch_item_error(item_id: str, error: Exception, supabase_headers: dict[str, str]) -> None:
    await _supabase_write_with_headers(
        "PATCH",
        f"transcription_items?id=eq.{item_id}",
        {
            "status": "error",
            "error_message": str(error)[:1200],
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
        supabase_headers,
    )


async def _process_batch(
    batch_id: str,
    platform: str,
    items: list[dict],
    supabase_headers: dict[str, str],
) -> None:
    total_items = len(items)
    max_concurrency = _max_concurrency_for_platform(platform, total_items)
    semaphore = asyncio.Semaphore(max_concurrency)
    progress_lock = asyncio.Lock()
    completed_items = 0
    error_count = 0

    async def _worker(item: dict) -> None:
        nonlocal completed_items, error_count

        item_id = str(item.get("id") or "")
        url = str(item.get("url") or "")
        if not item_id or not url:
            return

        async with semaphore:
            await _supabase_write_with_headers(
                "PATCH",
                f"transcription_items?id=eq.{item_id}",
                {"status": "processing"},
                supabase_headers,
            )

            try:
                result = await asyncio.wait_for(
                    _process_item(platform, url),
                    timeout=ITEM_PROCESS_TIMEOUT_SECONDS,
                )
                await _patch_item_success(item_id, result, supabase_headers)
                succeeded = True
            except asyncio.TimeoutError:
                timeout_error = RuntimeError(
                    f"Tempo maximo de {ITEM_PROCESS_TIMEOUT_SECONDS // 60} minutos excedido para esta URL"
                )
                logger.exception("[transcribe_batch] timed out item platform=%s url=%s", platform, url)
                await _patch_item_error(item_id, timeout_error, supabase_headers)
                succeeded = False
            except Exception as exc:
                logger.exception("[transcribe_batch] failed item platform=%s url=%s", platform, url)
                await _patch_item_error(item_id, exc, supabase_headers)
                succeeded = False

            async with progress_lock:
                completed_items += 1
                if not succeeded:
                    error_count += 1

                batch_status = "processing"
                if completed_items >= total_items:
                    batch_status = "partial_error" if error_count else "completed"

                await _patch_batch_progress(batch_id, completed_items, batch_status, supabase_headers)

    try:
        await asyncio.gather(*(_worker(item) for item in items))
        final_status = "partial_error" if error_count else "completed"
        await _patch_batch_progress(batch_id, completed_items, final_status, supabase_headers)
    except Exception as exc:
        logger.exception("[transcribe_batch] batch failed batch_id=%s", batch_id)
        await _patch_batch_progress(batch_id, completed_items, "partial_error", supabase_headers)
        raise exc


async def _load_batch(batch_id: str, supabase_headers: dict[str, str]) -> dict:
    rows = await _supabase_select(f"transcription_batches?id=eq.{batch_id}&select=*", supabase_headers)
    if not rows:
        raise HTTPException(status_code=404, detail="Batch nao encontrado")
    return rows[0]


async def _load_batch_items(batch_id: str, supabase_headers: dict[str, str]) -> list[dict]:
    return await _supabase_select(
        f"transcription_items?batch_id=eq.{batch_id}&select=*&order=created_at.asc",
        supabase_headers,
    )


@router.post("/batch")
async def create_transcription_batch(payload: BatchCreateRequest, request: Request):
    urls = _normalize_input_urls(payload.urls)
    if not urls:
        raise HTTPException(status_code=400, detail="Envie ao menos uma URL valida")

    invalid_urls = [url for url in urls if not _url_matches_platform(url, payload.platform)]
    if invalid_urls:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Uma ou mais URLs nao correspondem a plataforma informada",
                "invalid_urls": invalid_urls,
            },
        )

    supabase_headers = _require_supabase_headers(_extract_bearer_token(request))
    batch_record = _coerce_single_record(
        await _supabase_write_with_headers(
            "POST",
            "transcription_batches",
            {
                "user_id": payload.user_id,
                "platform": payload.platform,
                "status": "processing",
                "total_items": len(urls),
                "completed_items": 0,
            },
            supabase_headers,
        )
    )
    batch_id = str(batch_record.get("id") or "").strip()
    if not batch_id:
        raise HTTPException(status_code=500, detail="Nao foi possivel criar o batch de transcricao")

    inserted_items = await _supabase_insert_many(
        "transcription_items",
        [
            {
                "batch_id": batch_id,
                "url": url,
                "platform": payload.platform,
                "status": "pending",
            }
            for url in urls
        ],
        supabase_headers,
    )

    background_task = asyncio.create_task(_process_batch(batch_id, payload.platform, inserted_items, supabase_headers))
    _track_background_task(background_task)

    return {
        "batch_id": batch_id,
        "status": "processing",
        "total": len(urls),
    }


@router.get("/batch/{batch_id}")
async def get_transcription_batch(batch_id: str, request: Request, user_id: str | None = Query(default=None)):
    supabase_headers = _require_supabase_headers(_extract_bearer_token(request))
    batch = await _load_batch(batch_id, supabase_headers)
    if user_id and str(batch.get("user_id") or "") != user_id:
        raise HTTPException(status_code=404, detail="Batch nao encontrado")

    items = await _load_batch_items(batch_id, supabase_headers)
    total = int(batch.get("total_items") or len(items))
    completed = sum(1 for item in items if str(item.get("status") or "") in FINAL_ITEM_STATUSES)
    has_errors = any(str(item.get("status") or "") == "error" for item in items)

    status = str(batch.get("status") or "processing")
    if total > 0 and completed >= total:
        status = "partial_error" if has_errors else "completed"

    return {
        "batch_id": batch_id,
        "status": status,
        "total": total,
        "completed": completed,
        "items": [
            {
                "id": item.get("id"),
                "url": item.get("url"),
                "platform": item.get("platform"),
                "status": item.get("status"),
                "detected_language": item.get("detected_language"),
                "transcricao_original": item.get("transcricao_original"),
                "roteiro_adaptado": item.get("roteiro_adaptado"),
                "error_message": item.get("error_message"),
            }
            for item in items
        ],
    }
