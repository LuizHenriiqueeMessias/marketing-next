import json
import logging
import re
import time
from datetime import datetime, timezone

import httpx

from config import (
    ANTHROPIC_API_KEY,
    APIFY_TOKEN,
    GROQ_API_KEY,
    SUPABASE_HEADERS,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SUPABASE_ANON,
)
from prompts import SYSTEM_MASTER, SYSTEM_GENERIC

logger = logging.getLogger(__name__)


def resolve_system_prompt(base_prompt: str, custom_prompt: str) -> tuple[str, str]:
    """
    Escolhe o system prompt correto com base no custom_prompt do perfil.

    - Se custom_prompt existe → usa SYSTEM_GENERIC + custom_prompt como identidade
    - Se não → usa o base_prompt original (SYSTEM_MASTER para carrossel/vídeos,
      SYSTEM_ESTATICOS para estáticos)

    Retorna (system_prompt_final, custom_prompt_restante).
    O custom_prompt_restante será "" porque já foi incorporado.
    """
    if custom_prompt and custom_prompt.strip():
        logger.info("[resolve_prompt] Perfil com custom_prompt → usando SYSTEM_GENERIC")
        return SYSTEM_GENERIC, custom_prompt.strip()
    else:
        logger.info("[resolve_prompt] Perfil sem custom_prompt → usando prompt base padrão")
        return base_prompt, ""

# ── HTTP client compartilhado ─────────────────────────────────────────────────
_client = httpx.AsyncClient(timeout=120.0, trust_env=False)

# Groq Whisper supported formats + limits
# https://console.groq.com/docs/speech-text
GROQ_MAX_FILE_BYTES = 25 * 1024 * 1024  # free tier; dev tier aceita 100MB
_GROQ_CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "mpga": "audio/mpeg",
    "mpeg": "audio/mpeg",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "wav": "audio/wav",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "flac": "audio/flac",
}


def _groq_content_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _GROQ_CONTENT_TYPES.get(ext, "application/octet-stream")


def _describe_groq_error(resp: httpx.Response) -> str:
    """Extrai mensagem humana do corpo de erro do Groq."""
    try:
        payload = resp.json()
    except Exception:
        body = (resp.text or "").strip()
        return body[:400] or f"HTTP {resp.status_code}"

    if isinstance(payload, dict):
        err = payload.get("error")
        if isinstance(err, dict):
            msg = err.get("message") or err.get("code") or err.get("type")
            if isinstance(msg, str) and msg.strip():
                return msg.strip()
        msg = payload.get("message")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()
    return f"HTTP {resp.status_code}: {str(payload)[:400]}"


def _ensure_groq_can_accept(audio_bytes: bytes, filename: str) -> None:
    size = len(audio_bytes)
    if size == 0:
        raise RuntimeError("Arquivo de audio vazio — o download falhou antes da transcricao.")
    if size > GROQ_MAX_FILE_BYTES:
        mb = size / (1024 * 1024)
        raise RuntimeError(
            f"Arquivo com {mb:.1f} MB excede o limite de 25 MB do Groq Whisper. "
            "Reduza a duracao ou converta para audio comprimido antes de transcrever."
        )
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext and ext not in _GROQ_CONTENT_TYPES:
        raise RuntimeError(
            f"Formato .{ext} nao e aceito pelo Groq Whisper. "
            "Formatos suportados: mp3, m4a, mp4, wav, webm, ogg, flac."
        )


async def _transcribe_groq(audio_bytes: bytes, filename: str = "audio.mp4") -> str:
    """Envia o audio para o Groq (Whisper) e retorna a transcricao."""
    _ensure_groq_can_accept(audio_bytes, filename)
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
    files = {"file": (filename, audio_bytes, _groq_content_type(filename))}
    data = {"model": "whisper-large-v3", "language": "pt"}
    resp = await _client.post(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        headers=headers, files=files, data=data,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Groq Whisper recusou o audio: {_describe_groq_error(resp)}")
    return resp.json().get("text", "")


async def _transcribe_groq_auto(audio_bytes: bytes, filename: str = "audio.mp4") -> dict:
    """Transcreve sem forcar idioma para o Whisper detectar automaticamente."""
    _ensure_groq_can_accept(audio_bytes, filename)
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
    files = {"file": (filename, audio_bytes, _groq_content_type(filename))}
    data = {
        "model": "whisper-large-v3",
        "response_format": "verbose_json",
    }
    resp = await _client.post(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        headers=headers,
        files=files,
        data=data,
        timeout=240.0,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Groq Whisper recusou o audio: {_describe_groq_error(resp)}")
    result = resp.json()
    return {
        "text": result.get("text", ""),
        "language": result.get("language", "unknown"),
    }


async def fetch_apify_dataset(dataset_id: str, limit: int | None = None) -> list[dict]:
    """Busca itens do dataset Apify, opcionalmente limitando quantidade."""
    url = f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_TOKEN}"
    if limit and limit > 0:
        url += f"&limit={limit}"
    resp = await _client.get(url)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


async def fetch_apify_input(kv_store_id: str) -> dict:
    """Busca o INPUT do key-value store do Apify (usado pelo fluxo carrossel)."""
    url = f"https://api.apify.com/v2/key-value-stores/{kv_store_id}/records/INPUT?token={APIFY_TOKEN}"
    resp = await _client.get(url)
    resp.raise_for_status()
    return resp.json()


# ── Supabase helpers ──────────────────────────────────────────────────────────

async def supabase_get(path: str) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    resp = await _client.get(url, headers=SUPABASE_HEADERS)
    resp.raise_for_status()
    return resp.json()


def _parse_response_json(resp: httpx.Response) -> dict | list | None:
    try:
        return resp.json()
    except Exception:
        return None


def _extract_missing_column_name(error_payload: dict | list | None) -> str | None:
    if not isinstance(error_payload, dict):
        return None

    message = error_payload.get("message")
    if not isinstance(message, str):
        return None

    match = re.search(r"Could not find the '([^']+)' column", message)
    if match:
        return match.group(1)
    return None


async def _supabase_write(method: str, path: str, body: dict) -> dict | list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    payload = dict(body)

    while True:
        if not payload:
            logger.warning(f"[_supabase_write] payload vazio apos fallback de schema para {path}")
            return {}

        resp = await _client.request(method, url, headers=SUPABASE_HEADERS, json=payload)
        if resp.status_code < 400:
            if not resp.text.strip():
                return {}
            parsed = _parse_response_json(resp)
            return parsed if parsed is not None else {}

        error_payload = _parse_response_json(resp)
        missing_column = _extract_missing_column_name(error_payload)

        if missing_column and missing_column in payload:
            logger.warning(
                f"[_supabase_write] coluna ausente '{missing_column}' em {path} — removendo campo e tentando novamente"
            )
            payload.pop(missing_column, None)
            continue

        logger.error(f"[_supabase_write] {path} {resp.status_code}: {resp.text}")
        resp.raise_for_status()


async def supabase_post(path: str, body: dict) -> dict | list:
    return await _supabase_write("POST", path, body)


async def supabase_patch(path: str, body: dict) -> dict | list:
    return await _supabase_write("PATCH", path, body)


async def supabase_find_one(table: str, filters: dict[str, str], select: str = "id") -> dict | None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {"select": select, "limit": "1"}
    for key, value in filters.items():
        params[key] = f"eq.{value}"

    resp = await _client.get(url, headers=SUPABASE_HEADERS, params=params)
    if resp.status_code >= 400:
        logger.error(f"[supabase_find_one] {table} {resp.status_code}: {resp.text}")
        resp.raise_for_status()

    data = _parse_response_json(resp)
    if isinstance(data, list) and data:
        return data[0]
    return None


async def get_or_create_profile(instagram_handle: str) -> tuple[str, str]:
    """
    Busca o profile no Supabase.
    Se não existir, cria e retorna (id, client_name).
    Retorna (profile_id, client_name).
    """
    rows = await supabase_get(
        f"inspiration_profiles?instagram_handle=eq.{instagram_handle}&select=id,client_name"
    )
    if rows:
        return rows[0]["id"], rows[0].get("client_name", instagram_handle)

    # Criar novo profile
    created = await supabase_post(
        "inspiration_profiles",
        {
            "instagram_handle": instagram_handle,
            "client_name": instagram_handle,
            "own_instagram": instagram_handle,
        },
    )
    if isinstance(created, list):
        created = created[0]
    return created["id"], instagram_handle


async def get_client_name(profile_id: str) -> str:
    rows = await supabase_get(
        f"inspiration_profiles?id=eq.{profile_id}&select=client_name"
    )
    if rows:
        return rows[0].get("client_name", "")
    return ""


async def get_profile_custom_prompt(profile_id: str) -> str:
    """Busca o custom_prompt do perfil direto do Supabase."""
    rows = await supabase_get(
        f"inspiration_profiles?id=eq.{profile_id}&select=custom_prompt"
    )
    if rows:
        return rows[0].get("custom_prompt") or ""
    return ""


async def save_inspiration_post(data: dict) -> str | None:
    """Salva em inspiration_posts. Retorna o id criado/upsertado."""
    profile_id = str(data.get("profile_id") or "").strip()
    post_url = str(data.get("post_url") or "").strip()
    existing = None

    if profile_id and post_url:
        existing = await supabase_find_one(
            "inspiration_posts",
            {"profile_id": profile_id, "post_url": post_url},
            select="id",
        )

    if existing and existing.get("id"):
        result = await supabase_patch(
            f"inspiration_posts?id=eq.{existing['id']}",
            data,
        )
        if isinstance(result, list) and result:
            return result[0].get("id") or existing["id"]
        if isinstance(result, dict):
            return result.get("id") or existing["id"]
        return existing["id"]

    result = await supabase_post("inspiration_posts", data)
    if isinstance(result, list) and result:
        return result[0].get("id")
    if isinstance(result, dict):
        return result.get("id")
    return None


async def save_readapted_post(data: dict):
    """Salva em readapted_posts."""
    inspiration_post_id = str(data.get("inspiration_post_id") or "").strip()
    if not inspiration_post_id:
        logger.warning("[save_readapted_post] inspiration_post_id ausente — pulando save")
        return

    existing = await supabase_find_one(
        "readapted_posts",
        {"inspiration_post_id": inspiration_post_id},
        select="id",
    )

    if existing and existing.get("id"):
        await supabase_patch(f"readapted_posts?id=eq.{existing['id']}", data)
        return

    await supabase_post("readapted_posts", data)


async def mark_profile_scraped(profile_id: str):
    """Atualiza o timestamp da última coleta de um perfil de inspiração."""
    if not profile_id:
        return

    try:
        await supabase_patch(
            f"inspiration_profiles?id=eq.{profile_id}",
            {"last_scraped_at": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as exc:
        logger.warning(f"[mark_profile_scraped] falha ao atualizar profile {profile_id}: {exc}")


async def update_hashtag_collection(
    collection_id: str | None,
    *,
    add_posts: int = 0,  # mantido por compat — nao mais usado (sumimos por recount)
    status: str | None = None,
):
    """Atualiza uma coleta de hashtag (hashtag_collections).

    `posts_count` e RECONTADO a partir de inspiration_posts (em vez de
    incrementado), pra ser idempotente e evitar race condition entre os 3
    webhooks (estaticos/carrossel/videos) que processam a mesma coleta.

    Best effort — nunca derruba o fluxo principal se falhar.
    """
    _ = add_posts  # silencia linter; mantido na assinatura por retrocompat
    if not collection_id:
        return

    try:
        patch: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if status:
            patch["status"] = status

        # Recontagem idempotente: usa o header Content-Range do PostgREST
        # com Prefer: count=exact, sem trazer linhas.
        try:
            headers = {**SUPABASE_HEADERS, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"}
            resp = await _client.get(
                f"{SUPABASE_URL}/rest/v1/inspiration_posts?hashtag_collection_id=eq.{collection_id}&select=id",
                headers=headers,
            )
            content_range = resp.headers.get("content-range", "")  # ex: "0-0/27" ou "*/0"
            total_str = content_range.split("/")[-1] if "/" in content_range else ""
            patch["posts_count"] = int(total_str) if total_str.isdigit() else 0
        except Exception as count_exc:
            logger.warning(
                f"[update_hashtag_collection] falha ao recontar posts da coleta {collection_id}: {count_exc}"
            )

        await supabase_patch(f"hashtag_collections?id=eq.{collection_id}", patch)
    except Exception as exc:
        logger.warning(f"[update_hashtag_collection] falha ao atualizar coleta {collection_id}: {exc}")


async def upload_to_storage(
    file_bytes: bytes,
    storage_path: str,
    content_type: str,
) -> str:
    """Upload bytes to Supabase Storage ad-media bucket. Returns storage path."""
    _auth = SUPABASE_SERVICE_KEY or SUPABASE_ANON
    url = f"{SUPABASE_URL}/storage/v1/object/ad-media/{storage_path}"
    headers = {
        "apikey": _auth,
        "Authorization": f"Bearer {_auth}",
        "Content-Type": content_type,
    }
    resp = await _client.post(url, headers=headers, content=file_bytes)
    # If file already exists, try upsert
    if resp.status_code == 400:
        headers["x-upsert"] = "true"
        resp = await _client.post(url, headers=headers, content=file_bytes)
    resp.raise_for_status()
    return storage_path


# ── Anthropic helpers ─────────────────────────────────────────────────────────

async def call_claude(
    system: str,
    user_message: str,
    model: str,
    max_tokens: int = 2000,
    custom_prompt: str = "",
    image_url: str = "",
    image_bytes: bytes | None = None,
    image_media_type: str = "image/jpeg",
) -> str:
    """Chama a API Anthropic e retorna o texto da resposta."""
    if custom_prompt:
        system = (
            system
            + "\n\n"
            + "=" * 60
            + "\n⚠️ INSTRUÇÃO PERSONALIZADA DO CLIENTE — PRIORIDADE MÁXIMA\n"
            + "=" * 60
            + "\nAs instruções abaixo foram definidas pelo cliente e TÊM PRIORIDADE "
            + "sobre qualquer orientação anterior. Você DEVE adaptar o tom, a abordagem, "
            + "o estilo e o conteúdo da readaptação de acordo com estas instruções. "
            + "Se houver conflito entre o prompt base e estas instruções, siga ESTAS.\n\n"
            + custom_prompt
            + "\n" + "=" * 60
        )
    # Build user content — vision content blocks if image provided (D-09)
    # Prefer base64 (avoids robots.txt / auth issues), fall back to URL
    if image_bytes:
        import base64 as _b64
        user_content = [
            {"type": "image", "source": {"type": "base64", "media_type": image_media_type, "data": _b64.b64encode(image_bytes).decode()}},
            {"type": "text", "text": user_message},
        ]
    elif image_url:
        user_content = [
            {"type": "image", "source": {"type": "url", "url": image_url}},
            {"type": "text", "text": user_message},
        ]
    else:
        user_content = user_message
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
    }
    resp = await _client.post(
        "https://api.anthropic.com/v1/messages", headers=headers, json=body, timeout=300.0
    )
    if resp.status_code != 200:
        logger.error(f"[claude] {resp.status_code} — {resp.text}")
    resp.raise_for_status()
    data = resp.json()
    return data["content"][0]["text"]


def parse_llm_json(raw: str) -> dict:
    """Remove markdown fences e parseia JSON da resposta do LLM."""
    cleaned = re.sub(r"```json|```", "", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Tentar extrair o primeiro bloco JSON válido do texto bruto
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        return {"error": "parse_failed", "raw": raw[:500]}


async def parse_with_retry(
    system: str,
    user_message: str,
    model: str,
    image_url: str = "",
    image_bytes: bytes | None = None,
    image_media_type: str = "image/jpeg",
    max_attempts: int = 3,
) -> tuple[dict, bool]:
    """
    Chama Claude e parseia JSON com retry.
    Retorna (parsed_dict, needs_reanalysis).
    needs_reanalysis=True somente apos esgotar todas as tentativas.
    """
    raw = ""
    for attempt in range(1, max_attempts + 1):
        raw = await call_claude(system, user_message, model, image_url=image_url, image_bytes=image_bytes, image_media_type=image_media_type)
        result = parse_llm_json(raw)
        if "error" not in result:
            return result, False
        logger.warning(f"[ad_intelligence] JSON parse failed attempt {attempt}/{max_attempts}")
    return {"error": "parse_failed", "raw": raw[:500]}, True


def to_int(value) -> int:
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float):
        return max(0, int(value))
    if isinstance(value, str):
        digits = re.sub(r"[^0-9]", "", value)
        return int(digits) if digits else 0
    return 0


def normalize_text_fields(item: dict, keys: list[str]) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def normalize_caption(item: dict) -> str:
    return normalize_text_fields(item, ["caption", "description", "text", "story", "caption_text"])


def normalize_post_url(item: dict) -> str:
    return normalize_text_fields(item, ["url", "postUrl", "permalink", "shortUrl", "post_url"])


def normalize_owner_username(item: dict) -> str:
    return normalize_text_fields(item, ["ownerUsername", "owner_name", "username", "author"])


def normalize_thumbnail_url(item: dict) -> str:
    return normalize_text_fields(item, ["displayUrl", "thumbnailUrl", "imageUrl", "thumbnail_url"])


def normalize_video_url(item: dict) -> str:
    return normalize_text_fields(item, ["videoUrl", "video_url", "downloadUrl", "mediaUrl"])


def normalize_likes_count(item: dict) -> int:
    return to_int(item.get("likesCount") or item.get("likes") or item.get("likeCount") or item.get("like_count"))


def normalize_comments_count(item: dict) -> int:
    return to_int(item.get("commentsCount") or item.get("comments") or item.get("commentCount") or item.get("comment_count"))


def safe_post_id(item: dict) -> str:
    return (
        item.get("id")
        or item.get("shortCode")
        or item.get("shortcode")
        or item.get("postId")
        or item.get("post_id")
        or str(int(time.time() * 1000))
    )
