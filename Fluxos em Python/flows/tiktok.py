"""
Fluxo: TikTok — Coleta + Transcrição + Análise + Readaptação
Processa vídeos do TikTok via Apify (clockworks/tiktok-scraper):
  1. Busca dataset do webhook
  2. Baixa áudio ou usa legendas
  3. Transcreve com Groq Whisper
  4. Analisa com Claude
  5. Gera hooks magnéticos
  6. Salva em tiktok_posts + tiktok_readapted_posts
"""

import json
import logging
import re
from datetime import datetime, timezone

from config import CLAUDE_MODEL_TIKTOK
from prompts import SYSTEM_GENERIC
from utils import (
    _client,
    _transcribe_groq,
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
Voce gera hooks magneticos para conteudo de redes sociais (TikTok).
Responda apenas com JSON valido no formato:
{
  "engajamento": ["hook 1", "hook 2", "hook 3"],
  "autoridade": ["hook 1", "hook 2", "hook 3"],
  "conexao": ["hook 1", "hook 2", "hook 3"],
  "conversao": ["hook 1", "hook 2", "hook 3"]
}

Regras:
- Retorne exatamente 3 hooks por categoria.
- Os hooks devem ser curtos, naturais e prontos para uso em TikTok.
- Baseie os hooks na transcricao, na legenda e na analise feita.
- Nao use markdown.
"""

CORTES_SUGERIDOS_SYSTEM = """
Voce identifica os 3 melhores cortes de um video TikTok para repostagem.
Responda apenas com JSON valido no formato:
{
  "top_cortes": [
    {
      "ordem": 1,
      "timestamp_inicio": "00:00",
      "timestamp_fim": "00:20",
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

def _normalize_tiktok_caption(item: dict) -> str:
    return (item.get("text") or item.get("desc") or item.get("title") or "").strip()


def _normalize_tiktok_username(item: dict) -> str:
    author = item.get("authorMeta") or item.get("author") or {}
    if isinstance(author, dict):
        return (author.get("name") or author.get("nickname") or author.get("uniqueId") or "").strip()
    return str(author).strip()


def _normalize_tiktok_video_url(item: dict) -> str:
    return (
        item.get("webVideoUrl")
        or item.get("videoUrl")
        or item.get("url")
        or item.get("webUrl")
        or ""
    ).strip()


def _normalize_tiktok_video_id(item: dict) -> str:
    return str(item.get("id") or item.get("videoId") or "").strip()


def _normalize_tiktok_thumbnail(item: dict) -> str:
    video_meta = item.get("videoMeta") or item.get("video") or {}
    if isinstance(video_meta, dict):
        cover = video_meta.get("cover") or video_meta.get("coverUrl") or video_meta.get("originCover")
        if cover:
            return str(cover).strip()
    return (item.get("coverUrl") or item.get("cover") or "").strip()


def _normalize_tiktok_download_url(item: dict) -> str:
    video_meta = item.get("videoMeta") or item.get("video") or {}
    if isinstance(video_meta, dict):
        for key in ("downloadAddr", "playAddr", "url"):
            val = video_meta.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    return (item.get("downloadUrl") or item.get("videoUrl") or "").strip()


def _extract_hashtags(item: dict) -> list[str]:
    hashtags = item.get("hashtags") or []
    if isinstance(hashtags, list):
        result = []
        for h in hashtags:
            if isinstance(h, dict):
                result.append(h.get("name") or h.get("title") or "")
            elif isinstance(h, str):
                result.append(h)
        return [t.strip().lstrip("#") for t in result if t.strip()]

    caption = _normalize_tiktok_caption(item)
    return [tag.strip("#") for tag in re.findall(r"#\w+", caption)]


def _extract_music(item: dict) -> tuple[str, str]:
    music = item.get("musicMeta") or item.get("music") or item.get("song") or {}
    if isinstance(music, dict):
        name = music.get("musicName") or music.get("title") or music.get("name") or ""
        author = music.get("musicAuthor") or music.get("artist") or music.get("authorName") or ""
        return name.strip(), author.strip()
    return "", ""


def _extract_duration(item: dict) -> float | None:
    video_meta = item.get("videoMeta") or item.get("video") or {}
    if isinstance(video_meta, dict):
        d = video_meta.get("duration")
        if d is not None:
            try:
                return float(d)
            except (ValueError, TypeError):
                pass
    d = item.get("duration")
    if d is not None:
        try:
            return float(d)
        except (ValueError, TypeError):
            pass
    return None


def _extract_subtitles_text(item: dict) -> str:
    """Extract subtitle/caption text from TikTok item if available."""
    subtitles = item.get("subtitles") or item.get("captions") or item.get("subtitleInfos")
    if isinstance(subtitles, list):
        lines = []
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

async def _get_tiktok_custom_prompt(profile_id: str) -> str:
    rows = await supabase_get(f"tiktok_profiles?id=eq.{profile_id}&select=custom_prompt")
    if rows:
        return rows[0].get("custom_prompt") or ""
    return ""


async def _save_tiktok_post(data: dict) -> str | None:
    profile_id = str(data.get("profile_id") or "").strip()
    video_id = str(data.get("video_id") or "").strip()
    existing = None

    if profile_id and video_id:
        existing = await supabase_find_one(
            "tiktok_posts",
            {"profile_id": profile_id, "video_id": video_id},
            select="id",
        )

    if existing and existing.get("id"):
        result = await supabase_patch(f"tiktok_posts?id=eq.{existing['id']}", data)
        if isinstance(result, list) and result:
            return result[0].get("id") or existing["id"]
        if isinstance(result, dict):
            return result.get("id") or existing["id"]
        return existing["id"]

    result = await supabase_post("tiktok_posts", data)
    if isinstance(result, list) and result:
        return result[0].get("id")
    if isinstance(result, dict):
        return result.get("id")
    return None


async def _save_tiktok_readapted(data: dict):
    tiktok_post_id = str(data.get("tiktok_post_id") or "").strip()
    if not tiktok_post_id:
        return

    existing = await supabase_find_one(
        "tiktok_readapted_posts",
        {"tiktok_post_id": tiktok_post_id},
        select="id",
    )

    if existing and existing.get("id"):
        await supabase_patch(f"tiktok_readapted_posts?id=eq.{existing['id']}", data)
        return

    await supabase_post("tiktok_readapted_posts", data)


async def _mark_tiktok_profile_scraped(profile_id: str):
    if not profile_id:
        return
    try:
        await supabase_patch(
            f"tiktok_profiles?id=eq.{profile_id}",
            {"last_scraped_at": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as exc:
        logger.warning(f"[tiktok] falha ao atualizar profile {profile_id}: {exc}")


# ── Download + transcribe ────────────────────────────────────────────────────

async def _download_tiktok_audio(url: str) -> bytes:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.tiktok.com/",
    }
    resp = await _client.get(url, headers=headers, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


# ── Main processor ───────────────────────────────────────────────────────────

async def process_tiktok(webhook_body: dict):
    resource = webhook_body.get("resource", {})
    if isinstance(resource, str):
        try:
            resource = json.loads(resource)
        except Exception:
            resource = {}

    dataset_id = resource.get("defaultDatasetId")
    profile_id = webhook_body.get("profile_id", "")
    client_name = webhook_body.get("client_name", "")
    source = webhook_body.get("source", "")

    if not dataset_id:
        logger.error("[tiktok] dataset_id ausente no webhook body")
        return

    if not profile_id:
        logger.error("[tiktok] profile_id ausente — abortando")
        return

    logger.info(f"[tiktok] dataset_id={dataset_id} profile_id={profile_id}")

    custom_prompt = await _get_tiktok_custom_prompt(profile_id)

    items = await fetch_apify_dataset(dataset_id)
    logger.info(f"[tiktok] {len(items)} itens no dataset")

    # Update profile with author info from first item
    if items:
        first = items[0] if isinstance(items[0], dict) else {}
        author = first.get("authorMeta") or first.get("author") or {}
        if isinstance(author, dict):
            profile_update: dict[str, object] = {
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            avatar = author.get("avatar") or author.get("avatarLarger") or author.get("avatarMedium") or author.get("avatarThumb")
            if isinstance(avatar, str) and avatar.strip():
                profile_update["avatar"] = avatar.strip()
            handle = author.get("uniqueId") or author.get("name")
            if isinstance(handle, str) and handle.strip():
                profile_update["handle"] = handle.strip()
            bio = author.get("signature") or author.get("bio")
            if isinstance(bio, str) and bio.strip():
                profile_update["bio"] = bio.strip()
            fans = to_int(author.get("fans") or author.get("followerCount") or author.get("followers"))
            if fans is not None:
                profile_update["followers"] = fans
            following = to_int(author.get("following") or author.get("followingCount"))
            if following is not None:
                profile_update["following"] = following
            heart = to_int(author.get("heart") or author.get("heartCount") or author.get("likes"))
            if heart is not None:
                profile_update["likes_total"] = heart
            videos = to_int(author.get("video") or author.get("videoCount"))
            if videos is not None:
                profile_update["video_count"] = videos

            if len(profile_update) > 1:
                try:
                    await supabase_patch(f"tiktok_profiles?id=eq.{profile_id}", profile_update)
                    logger.info(f"[tiktok] profile updated with author data: {list(profile_update.keys())}")
                except Exception as exc:
                    logger.warning(f"[tiktok] failed to update profile: {exc}")

    for item in items:
        if not isinstance(item, dict):
            continue

        video_id = _normalize_tiktok_video_id(item)
        if not video_id:
            continue

        try:
            caption = _normalize_tiktok_caption(item)
            username = _normalize_tiktok_username(item)
            post_url = _normalize_tiktok_video_url(item)
            thumbnail = _normalize_tiktok_thumbnail(item)
            download_url = _normalize_tiktok_download_url(item)
            hashtags = _extract_hashtags(item)
            music_name, music_author = _extract_music(item)
            duration = _extract_duration(item)

            likes = to_int(item.get("diggCount") or item.get("likes")) or 0
            comments = to_int(item.get("commentCount") or item.get("comments")) or 0
            shares = to_int(item.get("shareCount") or item.get("shares")) or 0
            views = to_int(item.get("playCount") or item.get("views") or item.get("plays")) or 0
            bookmarks = to_int(item.get("collectCount") or item.get("bookmarks")) or 0

            # ── Transcrição ──────────────────────────────────────────────
            transcricao = _extract_subtitles_text(item)

            if not transcricao and download_url:
                try:
                    audio_bytes = await _download_tiktok_audio(download_url)
                    transcricao = await _transcribe_groq(audio_bytes)
                    logger.info(f"[tiktok] {video_id} transcrito via Whisper ({len(transcricao)} chars)")
                except Exception as exc:
                    logger.warning(f"[tiktok] {video_id} falha ao transcrever: {exc}")

            transcricao_formatada = _format_transcricao(transcricao) if transcricao else ""

            # ── Análise Claude ───────────────────────────────────────────
            user_msg = (
                f"TIPO: VIDEO TIKTOK\n"
                f"PERFIL DE ORIGEM: @{username}\n\n"
                f"LEGENDA ORIGINAL:\n{caption}\n\n"
                f"HASHTAGS: {', '.join(hashtags)}\n\n"
            )
            if transcricao:
                user_msg += f"TRANSCRIÇÃO:\n{transcricao}\n\n"
            user_msg += f"LINK DO POST: {post_url}"

            system_prompt, resolved_prompt = resolve_system_prompt(SYSTEM_GENERIC, custom_prompt)
            raw_llm = await call_claude(
                system=system_prompt,
                user_message=user_msg,
                model=CLAUDE_MODEL_TIKTOK,
                custom_prompt=resolved_prompt,
            )
            analysis = parse_llm_json(raw_llm)

            # ── Cortes sugeridos ─────────────────────────────────────────
            cortes_sugeridos = []
            if transcricao and duration and duration > 15:
                cortes_msg = (
                    f"PERFIL: @{username}\n"
                    f"TRANSCRICAO:\n{transcricao}\n"
                    f"TRANSCRICAO ESTRUTURADA:\n{transcricao_formatada}\n"
                    f"DURACAO: {duration}s\n"
                    f"LEGENDA: {caption}"
                )
                raw_cortes = await call_claude(
                    system=CORTES_SUGERIDOS_SYSTEM,
                    user_message=cortes_msg,
                    model=CLAUDE_MODEL_TIKTOK,
                    custom_prompt=resolved_prompt,
                )
                cortes_payload = parse_llm_json(raw_cortes)
                cortes_sugeridos = (
                    cortes_payload.get("top_cortes", [])
                    if isinstance(cortes_payload, dict)
                    else []
                )

            # ── Salvar tiktok_post ───────────────────────────────────────
            post_db_id = await _save_tiktok_post({
                "profile_id": profile_id,
                "video_id": video_id,
                "post_url": post_url,
                "caption": caption,
                "media_type": "video",
                "thumbnail_url": thumbnail,
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "views": views,
                "plays": views,
                "bookmarks": bookmarks,
                "duration": duration,
                "music_name": music_name,
                "music_author": music_author,
                "hashtags": hashtags,
                "transcricao": transcricao,
                "transcricao_formatada": transcricao_formatada,
                "cortes_sugeridos": cortes_sugeridos,
                "analysis": analysis,
                "raw_apify_data": item,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

            # ── Hooks magnéticos + readaptação ───────────────────────────
            descartar = analysis.get("descartar", False)
            if (not descartar or source == "specific") and post_db_id:
                hooks_msg = (
                    f"PERFIL: @{username}\n"
                    f"LEGENDA: {caption}\n"
                    f"ANALISE: {json.dumps(analysis, ensure_ascii=False)}\n"
                )
                if transcricao:
                    hooks_msg += f"TRANSCRICAO: {transcricao}\n"

                raw_hooks = await call_claude(
                    system=HOOKS_MAGNETICOS_SYSTEM,
                    user_message=hooks_msg,
                    model=CLAUDE_MODEL_TIKTOK,
                    custom_prompt=resolved_prompt,
                )
                hooks_magneticos = parse_llm_json(raw_hooks)

                await _save_tiktok_readapted({
                    "tiktok_post_id": post_db_id,
                    "profile_id": profile_id,
                    "client_name": client_name,
                    "original_caption": caption,
                    "original_post_url": post_url,
                    "original_thumbnail_url": thumbnail,
                    "media_type": "video",
                    "tema": analysis.get("tema"),
                    "gancho": analysis.get("gancho"),
                    "sugestao_readaptacao": analysis.get("sugestao_readaptacao"),
                    "hooks_magneticos": hooks_magneticos,
                    "score_relevancia": analysis.get("score_relevancia"),
                    "transcricao": transcricao,
                    "curtidas": likes,
                    "visualizacoes": views,
                    "envios": shares,
                })

            logger.info(f"[tiktok] {video_id} processado OK (post_db_id={post_db_id})")

        except Exception as exc:
            logger.exception(f"[tiktok] erro ao processar video {video_id}: {exc}")
            continue

    await _mark_tiktok_profile_scraped(profile_id)
    logger.info(f"[tiktok] fluxo concluido — profile_id={profile_id}")
