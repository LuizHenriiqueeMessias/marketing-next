"""
Fluxo: Instagram Gui — Vídeos V2
Processa posts de vídeo:
  1. Filtra apenas itens type == Video e não pinados
  2. Baixa o áudio (audioUrl)
  3. Transcreve com Groq Whisper
  4. Chama Claude para readaptação
  5. Cria profile automaticamente se não existir
  6. Salva no Supabase

Equivalente ao workflow: Fluxos_-_Insagram_Gui__Vídeos__V2.json
"""

import logging
import re

from config import CLAUDE_MODEL_VIDEOS
from prompts import SYSTEM_GENERIC
from utils import (
    _client,
    _transcribe_groq,
    call_claude,
    fetch_apify_dataset,
    get_or_create_profile,
    get_profile_custom_prompt,
    mark_profile_scraped,
    normalize_caption,
    normalize_comments_count,
    normalize_likes_count,
    normalize_owner_username,
    normalize_post_url,
    normalize_thumbnail_url,
    normalize_video_url,
    parse_llm_json,
    resolve_system_prompt,
    save_inspiration_post,
    save_readapted_post,
    to_int,
    safe_post_id,
    update_hashtag_collection,
)

logger = logging.getLogger(__name__)

CORTES_SUGERIDOS_SYSTEM = """
Voce identifica os 3 melhores cortes de um video curto ou longo para redes sociais.
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

HOOKS_MAGNETICOS_SYSTEM = """
Voce gera hooks magneticos para conteudo de redes sociais.
Responda apenas com JSON valido no formato:
{
  "engajamento": ["hook 1", "hook 2", "hook 3"],
  "autoridade": ["hook 1", "hook 2", "hook 3"],
  "conexao": ["hook 1", "hook 2", "hook 3"],
  "conversao": ["hook 1", "hook 2", "hook 3"]
}

Regras:
- Retorne exatamente 3 hooks por categoria.
- Os hooks devem ser curtos, naturais e prontos para uso.
- Baseie os hooks na transcricao, na legenda e na analise feita.
- Nao use markdown.
"""


def _filter_videos(items: list[dict]) -> list[dict]:
    """
    Mantém apenas posts de vídeo não pinados.
    """
    return [
        item for item in items
        if (
            (item.get("type") or item.get("mediaType") or "").strip().lower() in {"video", "reel", "graphvideo", "clip"}
            or bool(item.get("videoUrl") or item.get("audioUrl") or item.get("downloadUrl"))
        )
        and not (str(item.get("isPinned", "false")).lower() == "true")
    ]


async def _download_audio(audio_url: str) -> bytes:
    """Baixa o áudio do vídeo como bytes."""
    resp = await _client.get(audio_url, follow_redirects=True)
    resp.raise_for_status()
    return resp.content


def _build_user_message(item: dict, transcricao: str) -> str:
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    post_url = normalize_post_url(item)

    return (
        f"TIPO: VÍDEO TRANSCRITO\n"
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"TRANSCRIÇÃO:\n{transcricao}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}\n\n"
        f"LINK DO POST: {post_url}"
    )


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


def _build_cortes_user_message(item: dict, transcricao: str, transcricao_formatada: str) -> str:
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    post_url = normalize_post_url(item)

    return (
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"TRANSCRICAO BRUTA:\n{transcricao}\n\n"
        f"TRANSCRICAO ESTRUTURADA:\n{transcricao_formatada}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}\n\n"
        f"LINK DO POST: {post_url}"
    )


def _build_hooks_user_message(item: dict, analysis: dict, transcricao: str, transcricao_formatada: str) -> str:
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    post_url = normalize_post_url(item)

    return (
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"TRANSCRICAO BRUTA:\n{transcricao}\n\n"
        f"TRANSCRICAO ESTRUTURADA:\n{transcricao_formatada}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}\n\n"
        f"ANALISE PRINCIPAL:\n{analysis}\n\n"
        f"LINK DO POST: {post_url}"
    )


async def process_videos(webhook_body: dict):
    """
    Ponto de entrada do fluxo vídeos.
    webhook_body é o body do POST recebido do Apify.
    """
    resource = webhook_body.get("resource", {})
    dataset_id = resource.get("defaultDatasetId")
    profile_id_from_webhook = webhook_body.get("profile_id", "")
    client_name_from_webhook = webhook_body.get("client_name", "")
    source = webhook_body.get("source", "")
    hashtag_collection_id = webhook_body.get("hashtag_collection_id") or None
    post_source = source if source else "profile"
    saved_count = 0

    if not dataset_id:
        logger.error("[videos] dataset_id ausente no webhook body")
        return

    logger.info(f"[videos] dataset_id={dataset_id}")

    # Buscar custom_prompt do perfil direto do Supabase (mais confiável que webhook)
    custom_prompt = ""
    if profile_id_from_webhook:
        custom_prompt = await get_profile_custom_prompt(profile_id_from_webhook)
    logger.info(f"[videos] custom_prompt do Supabase: '{custom_prompt[:100] if custom_prompt else '(vazio)'}'")

    # 1. Buscar dataset Apify
    items = await fetch_apify_dataset(dataset_id)
    logger.info(f"[videos] {len(items)} itens no dataset")

    # 2. Filtrar apenas vídeos
    filtered = _filter_videos(items)
    logger.info(f"[videos] {len(filtered)} vídeos após filtro")

    # 3. Processar cada vídeo
    for item in filtered:
        post_id = safe_post_id(item)
        instagram_handle = (item.get("ownerUsername") or "").replace(".", "_")

        try:
            # Enriquecer item
            item["meta_likes"]    = normalize_likes_count(item)
            item["meta_comments"] = normalize_comments_count(item)

            # Resolver profile_id — usa webhook body ou busca/cria no Supabase
            if profile_id_from_webhook:
                profile_id  = profile_id_from_webhook
                client_name = client_name_from_webhook
            else:
                profile_id, client_name = await get_or_create_profile(instagram_handle)
                if not custom_prompt:
                    custom_prompt = await get_profile_custom_prompt(profile_id)

            item["profile_id"] = profile_id

            # 4. Download do áudio
            audio_url = item.get("audioUrl") or item.get("videoUrl") or ""
            if not audio_url:
                logger.warning(f"[videos] post {post_id} sem audioUrl — pulando")
                continue

            audio_bytes = await _download_audio(audio_url)

            # 5. Transcrição com Groq Whisper
            transcricao = await _transcribe_groq(audio_bytes)
            transcricao_formatada = _format_transcricao(transcricao)
            logger.info(
                f"[videos] post {post_id} transcrito "
                f"({len(transcricao)} chars)"
            )

            # 6. Chamar Claude
            user_msg = _build_user_message(item, transcricao)
            system_prompt, resolved_prompt = resolve_system_prompt(SYSTEM_GENERIC, custom_prompt)
            raw_llm = await call_claude(
                system=system_prompt,
                user_message=user_msg,
                model=CLAUDE_MODEL_VIDEOS,
                custom_prompt=resolved_prompt,
            )
            analysis = parse_llm_json(raw_llm)
            analysis["transcricao"] = transcricao
            analysis["transcricao_formatada"] = transcricao_formatada

            cortes_user_msg = _build_cortes_user_message(item, transcricao, transcricao_formatada)
            raw_cortes = await call_claude(
                system=CORTES_SUGERIDOS_SYSTEM,
                user_message=cortes_user_msg,
                model=CLAUDE_MODEL_VIDEOS,
                custom_prompt=resolved_prompt,
            )
            cortes_sugeridos_payload = parse_llm_json(raw_cortes)
            cortes_sugeridos = (
                cortes_sugeridos_payload.get("top_cortes", [])
                if isinstance(cortes_sugeridos_payload, dict)
                else []
            )

            # Dados consolidados
            curtidas      = normalize_likes_count(item)
            visualizacoes = to_int(item.get("videoViewCount") or item.get("videoPlayCount")) or normalize_comments_count(item)
            envios        = to_int(item.get("videoPlayCount"))
            thumbnail_url = normalize_thumbnail_url(item)
            video_url     = normalize_video_url(item) or audio_url
            post_url      = normalize_post_url(item)
            caption       = normalize_caption(item)

            # 7. Salvar inspiration_post
            insp_id = await save_inspiration_post({
                "profile_id":    profile_id,
                "post_id":       post_id,
                "post_url":      post_url,
                "caption":       caption,
                "media_type":    "video",
                "thumbnail_url": thumbnail_url,
                "video_url":     video_url,
                "analysis":      analysis,
                "curtidas":      curtidas,
                "visualizacoes": visualizacoes,
                "envios":        envios,
                "transcricao":   transcricao,
                "transcricao_formatada": transcricao_formatada,
                "cortes_sugeridos": cortes_sugeridos,
                "source":        post_source,
                "hashtag_collection_id": hashtag_collection_id,
            })

            # 8. Verificar descartar
            descartar = analysis.get("descartar", False)
            if not descartar or source == "specific":
                hooks_user_msg = _build_hooks_user_message(item, analysis, transcricao, transcricao_formatada)
                raw_hooks = await call_claude(
                    system=HOOKS_MAGNETICOS_SYSTEM,
                    user_message=hooks_user_msg,
                    model=CLAUDE_MODEL_VIDEOS,
                    custom_prompt=resolved_prompt,
                )
                hooks_magneticos = parse_llm_json(raw_hooks)

                await save_readapted_post({
                    "inspiration_post_id":    insp_id,
                    "profile_id":             profile_id,
                    "client_name":            client_name,
                    "original_caption":       caption,
                    "original_post_url":      post_url,
                    "original_thumbnail_url": thumbnail_url,
                    "media_type":             "video",
                    "tema":                   analysis.get("tema"),
                    "gancho":                 analysis.get("gancho"),
                    "sugestao_readaptacao":   analysis.get("sugestao_readaptacao"),
                    "score_relevancia":       analysis.get("score_relevancia"),
                    "curtidas":               curtidas,
                    "visualizacoes":          visualizacoes,
                    "envios":                 envios,
                    "status":                 "pendente",
                    "transcricao":            transcricao,
                    "hooks_magneticos":       hooks_magneticos,
                    "source":                 post_source,
                    "hashtag_collection_id":  hashtag_collection_id,
                })
                saved_count += 1
                logger.info(f"[videos] ✓ post {post_id} salvo (insp_id={insp_id})")
            else:
                logger.info(f"[videos] ✗ post {post_id} descartado pela IA")

        except Exception as e:
            logger.exception(f"[videos] Erro processando post {post_id}: {e}")

    if profile_id_from_webhook:
        await mark_profile_scraped(profile_id_from_webhook)
    if hashtag_collection_id:
        await update_hashtag_collection(hashtag_collection_id, add_posts=saved_count, status="done")
