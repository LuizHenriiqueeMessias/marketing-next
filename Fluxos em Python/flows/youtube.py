"""
Fluxo: YouTube — Coleta + Analise + Readaptacao
Espelha o fluxo TikTok (flows/tiktok.py), adaptado para videos YouTube via Apify
(streamers/youtube-scraper):
  1. Busca dataset do webhook
  2. Extrai legendas quando disponiveis (item.subtitles ou description)
  3. Analisa com Claude
  4. Gera hooks magneticos
  5. Salva em youtube_posts + youtube_readapted_posts
"""

import json
import logging
import re
from datetime import datetime, timezone

from config import CLAUDE_MODEL_YOUTUBE
from prompts import SYSTEM_GENERIC
from utils import (
    call_claude,
    fetch_apify_dataset,
    parse_llm_json,
    resolve_system_prompt,
    supabase_find_one,
    supabase_get,
    supabase_patch,
    supabase_post,
    to_int,
)

logger = logging.getLogger(__name__)

HOOKS_MAGNETICOS_SYSTEM = """
Voce gera hooks magneticos para conteudo de redes sociais (YouTube).
Responda apenas com JSON valido no formato:
{
  "engajamento": ["hook 1", "hook 2", "hook 3"],
  "autoridade": ["hook 1", "hook 2", "hook 3"],
  "conexao": ["hook 1", "hook 2", "hook 3"],
  "conversao": ["hook 1", "hook 2", "hook 3"]
}

Regras:
- Retorne exatamente 3 hooks por categoria.
- Os hooks devem ser curtos, naturais e prontos para uso em YouTube (titulos/thumbnails/primeiros segundos).
- Baseie os hooks no titulo, descricao, transcricao e analise feita.
- Nao use markdown.
"""

CORTES_SUGERIDOS_SYSTEM = """
Voce identifica os 3 melhores cortes de um video YouTube para repostagem em Shorts/Reels.
Responda apenas com JSON valido no formato:
{
  "top_cortes": [
    {
      "ordem": 1,
      "timestamp_inicio": "00:00",
      "timestamp_fim": "00:45",
      "motivo": "por que esse trecho funciona",
      "hook_sugerido": "hook curto para abrir esse corte",
      "instrucao_editor": "orientacao objetiva para o editor"
    }
  ]
}

Regras:
- Retorne exatamente 3 cortes.
- Os timestamps sao estimados com base na transcricao.
- Prefira trechos com promessa forte, quebra de padrao, historia, prova ou CTA.
- Nao use markdown.
"""


# ── Helpers ──────────────────────────────────────────────────────────────────

def _normalize_yt_title(item: dict) -> str:
    return (item.get("title") or item.get("name") or "").strip()


def _normalize_yt_description(item: dict) -> str:
    return (item.get("description") or item.get("text") or "").strip()


def _normalize_yt_video_id(item: dict) -> str:
    vid = item.get("id") or item.get("videoId") or item.get("video_id")
    if vid:
        return str(vid).strip()
    url = item.get("url") or item.get("videoUrl") or ""
    m = re.search(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{6,})", str(url))
    return m.group(1) if m else ""


def _normalize_yt_video_url(item: dict) -> str:
    return (
        item.get("url")
        or item.get("videoUrl")
        or item.get("webUrl")
        or ""
    ).strip()


def _normalize_yt_thumbnail(item: dict) -> str:
    for key in ("thumbnailUrl", "thumbnail"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    thumbs = item.get("thumbnails")
    if isinstance(thumbs, list) and thumbs:
        first = thumbs[-1] if len(thumbs) > 0 else None
        if isinstance(first, dict):
            return str(first.get("url") or "").strip()
        if isinstance(first, str):
            return first.strip()
    return ""


def _parse_duration_seconds(raw) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        try:
            return float(raw)
        except (ValueError, TypeError):
            return None
    s = str(raw).strip()
    if not s:
        return None
    # HH:MM:SS or MM:SS
    if ":" in s:
        parts = s.split(":")
        try:
            nums = [int(p) for p in parts]
        except ValueError:
            return None
        if len(nums) == 3:
            return float(nums[0] * 3600 + nums[1] * 60 + nums[2])
        if len(nums) == 2:
            return float(nums[0] * 60 + nums[1])
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _extract_duration(item: dict) -> float | None:
    for key in ("duration", "lengthSeconds", "length", "durationSeconds"):
        val = item.get(key)
        parsed = _parse_duration_seconds(val)
        if parsed is not None:
            return parsed
    return None


def _extract_published_at(item: dict) -> str | None:
    for key in ("date", "publishedAt", "published_at", "uploadDate", "publishDate"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _extract_is_short(item: dict) -> bool:
    url = _normalize_yt_video_url(item).lower()
    if "/shorts/" in url:
        return True
    duration = _extract_duration(item)
    if duration is not None and duration <= 60:
        return True
    t = str(item.get("type") or "").lower()
    return "short" in t


def _extract_tags(item: dict) -> list[str]:
    tags = item.get("tags") or item.get("keywords")
    if isinstance(tags, list):
        return [str(t).strip().lstrip("#") for t in tags if str(t).strip()]
    if isinstance(tags, str) and tags.strip():
        return [t.strip().lstrip("#") for t in re.split(r"[,;]", tags) if t.strip()]
    return []


def _extract_subtitles_text(item: dict) -> str:
    subtitles = item.get("subtitles") or item.get("captions") or item.get("transcript")
    if isinstance(subtitles, list):
        lines: list[str] = []
        for entry in subtitles:
            if isinstance(entry, dict):
                text = entry.get("text") or entry.get("content") or ""
                if isinstance(text, str) and text.strip():
                    lines.append(text.strip())
            elif isinstance(entry, str) and entry.strip():
                lines.append(entry.strip())
        if lines:
            return "\n".join(lines)
    if isinstance(subtitles, str) and subtitles.strip():
        return subtitles.strip()
    return ""


def _split_transcription_blocks(raw_text: str) -> list[str]:
    cleaned = re.sub(r"\r\n?", "\n", raw_text or "").strip()
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return [
        chunk.strip(" -•\t")
        for chunk in re.split(r"\n+|(?<=[.!?])\s+", cleaned)
        if chunk and chunk.strip(" -•\t")
    ]


def _format_transcricao(raw_text: str) -> str:
    blocks = _split_transcription_blocks(raw_text)
    if not blocks:
        return (
            "[GANCHO]\nSem conteudo suficiente.\n\n"
            "[DESENVOLVIMENTO]\nSem conteudo suficiente.\n\n"
            "[CTA/FECHAMENTO]\nSem conteudo suficiente.\n\n"
            "[3 DESTAQUES]\n- Sem destaque 1\n- Sem destaque 2\n- Sem destaque 3"
        )

    gancho = blocks[0]
    desenvolvimento = " ".join(blocks[1:-1]).strip() if len(blocks) > 2 else (
        blocks[1] if len(blocks) > 1 else blocks[0]
    )
    fechamento = blocks[-1] if len(blocks) > 1 else blocks[0]

    destaques: list[str] = []
    for candidate in blocks:
        normalized = candidate.lower()
        if any(existing.lower() == normalized for existing in destaques):
            continue
        destaques.append(candidate)
        if len(destaques) == 3:
            break
    while len(destaques) < 3:
        destaques.append(f"Sem destaque adicional {len(destaques) + 1}")

    return (
        f"[GANCHO]\n{gancho}\n\n"
        f"[DESENVOLVIMENTO]\n{desenvolvimento}\n\n"
        f"[CTA/FECHAMENTO]\n{fechamento}\n\n"
        "[3 DESTAQUES]\n"
        f"- {destaques[0]}\n"
        f"- {destaques[1]}\n"
        f"- {destaques[2]}"
    )


# ── Save helpers ─────────────────────────────────────────────────────────────

async def _get_youtube_custom_prompt(channel_id: str) -> str:
    rows = await supabase_get(f"youtube_channels?id=eq.{channel_id}&select=custom_prompt")
    if rows:
        return rows[0].get("custom_prompt") or ""
    return ""


async def _save_youtube_post(data: dict) -> str | None:
    channel_id = str(data.get("channel_id") or "").strip()
    video_id = str(data.get("video_id") or "").strip()
    existing = None

    if channel_id and video_id:
        existing = await supabase_find_one(
            "youtube_posts",
            {"channel_id": channel_id, "video_id": video_id},
            select="id",
        )

    if existing and existing.get("id"):
        result = await supabase_patch(f"youtube_posts?id=eq.{existing['id']}", data)
        if isinstance(result, list) and result:
            return result[0].get("id") or existing["id"]
        if isinstance(result, dict):
            return result.get("id") or existing["id"]
        return existing["id"]

    result = await supabase_post("youtube_posts", data)
    if isinstance(result, list) and result:
        return result[0].get("id")
    if isinstance(result, dict):
        return result.get("id")
    return None


async def _save_youtube_readapted(data: dict):
    youtube_post_id = str(data.get("youtube_post_id") or "").strip()
    if not youtube_post_id:
        return

    existing = await supabase_find_one(
        "youtube_readapted_posts",
        {"youtube_post_id": youtube_post_id},
        select="id",
    )

    if existing and existing.get("id"):
        await supabase_patch(f"youtube_readapted_posts?id=eq.{existing['id']}", data)
        return

    await supabase_post("youtube_readapted_posts", data)


async def _mark_youtube_channel_scraped(channel_id: str):
    if not channel_id:
        return
    try:
        await supabase_patch(
            f"youtube_channels?id=eq.{channel_id}",
            {"last_scraped_at": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as exc:
        logger.warning(f"[youtube] falha ao atualizar channel {channel_id}: {exc}")


# ── Main processor ───────────────────────────────────────────────────────────

async def process_youtube(webhook_body: dict):
    resource = webhook_body.get("resource", {})
    if isinstance(resource, str):
        try:
            resource = json.loads(resource)
        except Exception:
            resource = {}

    dataset_id = resource.get("defaultDatasetId")
    channel_id = webhook_body.get("channel_id", "")
    client_name = webhook_body.get("client_name", "")
    source = webhook_body.get("source", "")

    if not dataset_id:
        logger.error("[youtube] dataset_id ausente no webhook body")
        return

    if not channel_id:
        logger.error("[youtube] channel_id ausente — abortando")
        return

    logger.info(f"[youtube] dataset_id={dataset_id} channel_id={channel_id}")

    custom_prompt = await _get_youtube_custom_prompt(channel_id)

    items = await fetch_apify_dataset(dataset_id)
    logger.info(f"[youtube] {len(items)} itens no dataset")

    # Update channel with author info from first item
    if items:
        first = items[0] if isinstance(items[0], dict) else {}
        channel_update: dict[str, object] = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        avatar = (
            first.get("channelAvatarUrl")
            or first.get("channelThumbnail")
            or first.get("channelImage")
            or first.get("authorThumbnail")
        )
        if isinstance(avatar, str) and avatar.strip():
            channel_update["avatar"] = avatar.strip()
        handle = first.get("channelHandle") or first.get("channelUsername")
        if isinstance(handle, str) and handle.strip():
            clean_handle = handle.strip().lstrip("@")
            if clean_handle:
                channel_update["handle"] = clean_handle
        channel_platform_id = first.get("channelId") or first.get("channel_id")
        if isinstance(channel_platform_id, str) and channel_platform_id.strip():
            channel_update["channel_id"] = channel_platform_id.strip()
        bio = first.get("channelDescription") or first.get("channelBio")
        if isinstance(bio, str) and bio.strip():
            channel_update["bio"] = bio.strip()
        subs = to_int(
            first.get("numberOfSubscribers")
            or first.get("subscribers")
            or first.get("subscriberCount")
        )
        if subs is not None:
            channel_update["subscribers"] = subs
        total_views = to_int(first.get("channelTotalViews") or first.get("channelViews"))
        if total_views is not None:
            channel_update["total_views"] = total_views
        videos_total = to_int(first.get("channelTotalVideos") or first.get("channelVideoCount"))
        if videos_total is not None:
            channel_update["video_count"] = videos_total

        if len(channel_update) > 1:
            try:
                await supabase_patch(f"youtube_channels?id=eq.{channel_id}", channel_update)
                logger.info(f"[youtube] channel updated with author data: {list(channel_update.keys())}")
            except Exception as exc:
                logger.warning(f"[youtube] failed to update channel: {exc}")

    for item in items:
        if not isinstance(item, dict):
            continue

        video_id = _normalize_yt_video_id(item)
        if not video_id:
            continue

        try:
            title = _normalize_yt_title(item)
            description = _normalize_yt_description(item)
            post_url = _normalize_yt_video_url(item)
            thumbnail = _normalize_yt_thumbnail(item)
            tags = _extract_tags(item)
            duration = _extract_duration(item)
            published_at = _extract_published_at(item)
            is_short = _extract_is_short(item)

            views = to_int(item.get("viewCount") or item.get("views") or item.get("plays")) or 0
            likes = to_int(item.get("likes") or item.get("likeCount")) or 0
            comments = to_int(item.get("commentsCount") or item.get("commentCount") or item.get("comments")) or 0

            # ── Transcricao via subtitles do Apify (se disponivel) ──────
            transcricao = _extract_subtitles_text(item)
            if not transcricao:
                # Fallback fraco: usa descricao como contexto (nao eh transcricao real)
                transcricao = ""

            transcricao_formatada = _format_transcricao(transcricao) if transcricao else ""

            # ── Analise Claude ──────────────────────────────────────────
            channel_name_hint = (
                item.get("channelName")
                or item.get("channelTitle")
                or item.get("author")
                or ""
            )
            user_msg = (
                f"TIPO: VIDEO YOUTUBE{' (Short)' if is_short else ''}\n"
                f"CANAL DE ORIGEM: {channel_name_hint}\n\n"
                f"TITULO:\n{title}\n\n"
            )
            if description:
                user_msg += f"DESCRICAO:\n{description}\n\n"
            if tags:
                user_msg += f"TAGS: {', '.join(tags)}\n\n"
            if transcricao:
                user_msg += f"TRANSCRICAO:\n{transcricao}\n\n"
            user_msg += f"LINK DO VIDEO: {post_url}"

            system_prompt, resolved_prompt = resolve_system_prompt(SYSTEM_GENERIC, custom_prompt)
            raw_llm = await call_claude(
                system=system_prompt,
                user_message=user_msg,
                model=CLAUDE_MODEL_YOUTUBE,
                custom_prompt=resolved_prompt,
            )
            analysis = parse_llm_json(raw_llm)

            # ── Cortes sugeridos ────────────────────────────────────────
            cortes_sugeridos = []
            if transcricao and duration and duration > 60:
                cortes_msg = (
                    f"CANAL: {channel_name_hint}\n"
                    f"TITULO: {title}\n"
                    f"TRANSCRICAO:\n{transcricao}\n"
                    f"TRANSCRICAO ESTRUTURADA:\n{transcricao_formatada}\n"
                    f"DURACAO: {duration}s\n"
                    f"DESCRICAO: {description}"
                )
                raw_cortes = await call_claude(
                    system=CORTES_SUGERIDOS_SYSTEM,
                    user_message=cortes_msg,
                    model=CLAUDE_MODEL_YOUTUBE,
                    custom_prompt=resolved_prompt,
                )
                cortes_payload = parse_llm_json(raw_cortes)
                cortes_sugeridos = (
                    cortes_payload.get("top_cortes", [])
                    if isinstance(cortes_payload, dict)
                    else []
                )

            # ── Salvar youtube_post ─────────────────────────────────────
            post_db_id = await _save_youtube_post({
                "channel_id": channel_id,
                "video_id": video_id,
                "post_url": post_url,
                "title": title,
                "description": description,
                "media_type": "short" if is_short else "video",
                "thumbnail_url": thumbnail,
                "views": views,
                "likes": likes,
                "comments": comments,
                "duration": duration,
                "published_at": published_at,
                "is_short": is_short,
                "tags": tags,
                "transcricao": transcricao,
                "transcricao_formatada": transcricao_formatada,
                "cortes_sugeridos": cortes_sugeridos,
                "analysis": analysis,
                "raw_apify_data": item,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

            # ── Hooks magneticos + readaptacao ──────────────────────────
            descartar = analysis.get("descartar", False)
            if (not descartar or source == "specific") and post_db_id:
                hooks_msg = (
                    f"CANAL: {channel_name_hint}\n"
                    f"TITULO: {title}\n"
                    f"DESCRICAO: {description}\n"
                    f"ANALISE: {json.dumps(analysis, ensure_ascii=False)}\n"
                )
                if transcricao:
                    hooks_msg += f"TRANSCRICAO: {transcricao}\n"

                raw_hooks = await call_claude(
                    system=HOOKS_MAGNETICOS_SYSTEM,
                    user_message=hooks_msg,
                    model=CLAUDE_MODEL_YOUTUBE,
                    custom_prompt=resolved_prompt,
                )
                hooks_magneticos = parse_llm_json(raw_hooks)

                await _save_youtube_readapted({
                    "youtube_post_id": post_db_id,
                    "channel_id": channel_id,
                    "client_name": client_name,
                    "original_title": title,
                    "original_description": description,
                    "original_post_url": post_url,
                    "original_thumbnail_url": thumbnail,
                    "media_type": "short" if is_short else "video",
                    "tema": analysis.get("tema"),
                    "gancho": analysis.get("gancho"),
                    "sugestao_readaptacao": analysis.get("sugestao_readaptacao"),
                    "hooks_magneticos": hooks_magneticos,
                    "score_relevancia": analysis.get("score_relevancia"),
                    "transcricao": transcricao,
                    "visualizacoes": views,
                    "curtidas": likes,
                    "comentarios": comments,
                })

            logger.info(f"[youtube] {video_id} processado OK (post_db_id={post_db_id})")

        except Exception as exc:
            logger.exception(f"[youtube] erro ao processar video {video_id}: {exc}")
            continue

    await _mark_youtube_channel_scraped(channel_id)
    logger.info(f"[youtube] fluxo concluido — channel_id={channel_id}")
