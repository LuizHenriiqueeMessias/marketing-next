"""
Fluxo: Instagram Gui — Estáticos V2
Processa posts estáticos (imagens simples, sem carrossel e sem vídeo).
Equivalente ao workflow n8n: Fluxos_-_Instagram_Gui__Estáticos__V2.json
"""

import logging

from config import CLAUDE_MODEL_ESTATICOS
from prompts import SYSTEM_GENERIC
from utils import (
    call_claude,
    fetch_apify_dataset,
    get_profile_custom_prompt,
    normalize_caption,
    normalize_comments_count,
    normalize_likes_count,
    normalize_owner_username,
    normalize_post_url,
    normalize_thumbnail_url,
    mark_profile_scraped,
    parse_llm_json,
    resolve_system_prompt,
    save_inspiration_post,
    save_readapted_post,
    to_int,
    safe_post_id,
    update_hashtag_collection,
)

logger = logging.getLogger(__name__)

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
- Baseie os hooks no conteudo original e na analise feita.
- Nao use markdown.
"""


def _filter_estaticos(items: list[dict]) -> list[dict]:
    """
    Mantém apenas posts que:
      - NÃO são vídeo
      - NÃO são pinados
      - NÃO são carrossel (Sidecar)
    """
    result = []
    for item in items:
        tipo = (item.get("type") or item.get("mediaType") or "").strip().lower()
        is_pinned = str(item.get("isPinned", "false")).lower() == "true"
        has_carousel = bool(item.get("sidecarItems") or item.get("childPosts") or item.get("carouselMedia"))
        has_video = bool(item.get("videoUrl") or item.get("audioUrl") or item.get("downloadUrl"))
        if tipo == "Video":
            continue
        if is_pinned:
            continue
        if tipo in {"video", "reel", "graphvideo", "clip"} or has_video:
            continue
        if tipo in {"sidecar", "carousel", "graphsidecar"} or has_carousel:
            continue
        result.append(item)
    return result


def _build_user_message(item: dict, profile_id: str) -> str:
    tipo = "POST ESTÁTICO"
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    url = normalize_post_url(item)
    image_url = normalize_thumbnail_url(item)

    return (
        f"TIPO: {tipo}\n"
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}\n\n"
        f"LINK DO POST: {url}\n\n"
        f"IMAGEM: {image_url}"
    )


def _build_hooks_user_message(item: dict, analysis: dict) -> str:
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    post_url = normalize_post_url(item)

    return (
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}\n\n"
        f"ANALISE PRINCIPAL:\n{analysis}\n\n"
        f"LINK DO POST: {post_url}"
    )


async def process_estaticos(webhook_body: dict):
    """
    Ponto de entrada do fluxo estáticos.
    webhook_body é o body do POST recebido do Apify.
    """
    resource = webhook_body.get("resource", {})
    dataset_id = resource.get("defaultDatasetId")
    profile_id = webhook_body.get("profile_id", "")
    client_name = webhook_body.get("client_name", "")
    source = webhook_body.get("source", "")
    hashtag_collection_id = webhook_body.get("hashtag_collection_id") or None
    post_source = source if source else "profile"
    saved_count = 0
    if not dataset_id:
        logger.error("[estaticos] dataset_id ausente no webhook body")
        return

    if not profile_id:
        logger.error("[estaticos] profile_id ausente no webhook body — abortando")
        return

    logger.info(f"[estaticos] dataset_id={dataset_id} profile_id={profile_id}")

    # Buscar custom_prompt do perfil direto do Supabase (mais confiável que webhook)
    custom_prompt = await get_profile_custom_prompt(profile_id)
    logger.info(f"[estaticos] custom_prompt do Supabase: '{custom_prompt[:100] if custom_prompt else '(vazio)'}'")

    # 1. Buscar dataset Apify
    items = await fetch_apify_dataset(dataset_id)
    logger.info(f"[estaticos] {len(items)} itens no dataset")

    # 2. Filtrar apenas imagens estáticas
    filtered = _filter_estaticos(items)
    logger.info(f"[estaticos] {len(filtered)} itens após filtro")

    # 3. Processar cada item
    for item in filtered:
        post_id = safe_post_id(item)
        instagram_handle = (item.get("ownerUsername") or "").replace(".", "_")

        try:
            # Enriquecer item com campos normalizados
            item["profile_id"] = profile_id
            item["meta_likes"] = normalize_likes_count(item)
            item["meta_comments"] = normalize_comments_count(item)

            # Montar user message e chamar Claude
            user_msg = _build_user_message(item, profile_id)
            system_prompt, resolved_prompt = resolve_system_prompt(SYSTEM_GENERIC, custom_prompt)
            raw_llm = await call_claude(
                system=system_prompt,
                user_message=user_msg,
                model=CLAUDE_MODEL_ESTATICOS,
                custom_prompt=resolved_prompt,
            )
            analysis = parse_llm_json(raw_llm)

            # Dados consolidados para salvar
            curtidas = normalize_likes_count(item)
            visualizacoes = normalize_comments_count(item)
            thumbnail_url = normalize_thumbnail_url(item)
            post_url = normalize_post_url(item)
            caption = normalize_caption(item)

            # 4. Salvar inspiration_post
            insp_id = await save_inspiration_post({
                "profile_id":    profile_id,
                "post_id":       post_id,
                "post_url":      post_url,
                "caption":       caption,
                "media_type":    "image",
                "thumbnail_url": thumbnail_url,
                "analysis":      analysis,
                "curtidas":      curtidas,
                "visualizacoes": visualizacoes,
                "envios":        0,
                "source":        post_source,
                "hashtag_collection_id": hashtag_collection_id,
            })

            # 5. Verificar descartar
            descartar = analysis.get("descartar", False)
            if not descartar or source == "specific":
                hooks_user_msg = _build_hooks_user_message(item, analysis)
                raw_hooks = await call_claude(
                    system=HOOKS_MAGNETICOS_SYSTEM,
                    user_message=hooks_user_msg,
                    model=CLAUDE_MODEL_ESTATICOS,
                    custom_prompt=resolved_prompt,
                )
                hooks_magneticos = parse_llm_json(raw_hooks)

                # 6. Salvar readapted_post
                await save_readapted_post({
                    "inspiration_post_id":   insp_id,
                    "profile_id":            profile_id,
                    "client_name":           client_name,
                    "original_caption":      caption,
                    "original_post_url":     post_url,
                    "original_thumbnail_url": thumbnail_url,
                    "media_type":            "image",
                    "tema":                  analysis.get("tema"),
                    "gancho":                analysis.get("gancho"),
                    "sugestao_readaptacao":  analysis.get("sugestao_readaptacao"),
                    "score_relevancia":      analysis.get("score_relevancia"),
                    "curtidas":              curtidas,
                    "visualizacoes":         visualizacoes,
                    "envios":                0,
                    "status":                "pendente",
                    "hooks_magneticos":      hooks_magneticos,
                    "source":                post_source,
                    "hashtag_collection_id": hashtag_collection_id,
                })
                saved_count += 1
                logger.info(f"[estaticos] ✓ post {post_id} salvo (insp_id={insp_id})")
            else:
                logger.info(f"[estaticos] ✗ post {post_id} descartado pela IA")

        except Exception as e:
            logger.exception(f"[estaticos] Erro processando post {post_id}: {e}")

    await mark_profile_scraped(profile_id)
    if hashtag_collection_id:
        await update_hashtag_collection(hashtag_collection_id, add_posts=saved_count, status="done")
