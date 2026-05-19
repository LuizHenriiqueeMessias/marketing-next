"""
Fluxo: Instagram Gui — Estáticos V2 com Carrossel
Processa posts do tipo Sidecar (carrossel):
  1. Detecta slides via sidecarItems / childPosts
  2. Chama OpenRouter Vision para extrair conteúdo dos slides
  3. Chama Claude para readaptação
  4. Salva no Supabase

Equivalente ao workflow: Fluxos_-_Instagram_Gui__Estáticos__V2_-_Com_Carrossel__CORRIGIDO___1_.json
"""

import json
import logging
import re

import httpx

from config import (
    CLAUDE_MODEL_CARROSSEL,
    OPENROUTER_API_KEY,
    OPENROUTER_VISION_MODEL,
)
from prompts import SYSTEM_GENERIC
from utils import (
    call_claude,
    fetch_apify_dataset,
    fetch_apify_input,
    get_client_name,
    get_profile_custom_prompt,
    mark_profile_scraped,
    normalize_caption,
    normalize_comments_count,
    normalize_likes_count,
    normalize_owner_username,
    normalize_post_url,
    normalize_thumbnail_url,
    parse_llm_json,
    resolve_system_prompt,
    save_inspiration_post,
    save_readapted_post,
    to_int,
    safe_post_id,
    update_hashtag_collection,
)

logger = logging.getLogger(__name__)
_client = httpx.AsyncClient(timeout=120.0, trust_env=False)

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
- Baseie os hooks no conteudo original, no texto dos slides e na analise feita.
- Nao use markdown.
"""


def _filter_carrossel(items: list[dict]) -> list[dict]:
    """
    Mantém apenas posts que:
      - NÃO são vídeo
      - NÃO são pinados
      - SÃO Sidecar (carrossel)
    """
    result = []
    for item in items:
        tipo = (item.get("type") or item.get("mediaType") or "").strip().lower()
        is_pinned = str(item.get("isPinned", "false")).lower() == "true"
        has_carousel = bool(item.get("sidecarItems") or item.get("childPosts") or item.get("carouselMedia"))
        if tipo in {"video", "reel", "graphvideo", "clip"} or bool(item.get("videoUrl") or item.get("audioUrl")):
            continue
        if is_pinned:
            continue
        if tipo in {"sidecar", "carousel", "graphsidecar"} or has_carousel:
            result.append(item)
    return result


def _extract_carousel_slides(item: dict) -> tuple[bool, list[str]]:
    """
    Extrai URLs dos slides do carrossel.
    Retorna (is_carousel, [slide_urls]).
    """
    sidecar = item.get("sidecarItems") or []
    child   = item.get("childPosts") or []
    tipo    = item.get("type", "")

    is_carousel = len(sidecar) > 0 or len(child) > 0 or tipo == "Sidecar"

    source = sidecar if sidecar else child
    slide_urls = [
        s.get("displayUrl") or s.get("thumbnailUrl") or s.get("imageUrl")
        for s in source
        if s.get("displayUrl") or s.get("thumbnailUrl") or s.get("imageUrl")
    ][:10]

    if not slide_urls:
        thumbnail_url = normalize_thumbnail_url(item)
        if thumbnail_url:
            slide_urls = [thumbnail_url]

    return is_carousel, slide_urls


async def _call_vision_api(slide_urls: list[str]) -> dict:
    """
    Chama OpenRouter Vision para analisar os slides do carrossel.
    Retorna JSON com slides e tema_geral.
    """
    image_content = [
        {"type": "image_url", "image_url": {"url": url}}
        for url in slide_urls
    ]
    image_content.append({
        "type": "text",
        "text": (
            f"Analise este carrossel do Instagram com {len(slide_urls)} slides. "
            "Para cada slide extraia o texto principal visivel, corpo do conteudo e CTA se houver. "
            'Responda APENAS com JSON puro sem markdown: '
            '{"slides":[{"slide":1,"titulo":"titulo","corpo":"conteudo completo","cta":"cta ou vazio"}],'
            '"tema_geral":"tema em 1 frase"}'
        ),
    })

    payload = {
        "model": OPENROUTER_VISION_MODEL,
        "max_tokens": 2000,
        "messages": [{"role": "user", "content": image_content}],
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    resp = await _client.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload,
    )
    resp.raise_for_status()
    return resp.json()


def _parse_vision_response(vision_resp: dict) -> tuple[str, str]:
    """
    Parseia a resposta da Vision API.
    Retorna (slides_formatado, tema_geral).
    """
    try:
        raw_text = vision_resp["choices"][0]["message"]["content"]
        cleaned = raw_text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)

        slides = parsed.get("slides")
        tema_geral = parsed.get("tema_geral", "")

        if not slides or not isinstance(slides, list):
            slides = [{
                "slide": 1,
                "titulo": parsed.get("titulo", ""),
                "corpo":  parsed.get("corpo", ""),
                "cta":    parsed.get("cta", ""),
            }]

        lines = []
        for s in slides:
            line = f"Slide {s.get('slide', '?')}:\nTitulo: {s.get('titulo','')}\nConteudo: {s.get('corpo','')}"
            if s.get("cta"):
                line += f"\nCTA: {s['cta']}"
            lines.append(line)

        slides_str = "\n\n".join(lines)
        if len(slides_str) > 3000:
            slides_str = slides_str[:3000] + "\n[...conteudo truncado]"

        return slides_str, tema_geral

    except Exception as e:
        logger.warning(f"[carrossel] Erro parseia vision: {e}")
        return "Erro na extração dos slides", ""


def _build_user_message(item: dict, slides_content: str, tema_geral: str) -> str:
    is_carousel = item.get("is_carousel", False)
    slide_count = item.get("slide_count", 1)
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    post_url = normalize_post_url(item)
    image_url = normalize_thumbnail_url(item)

    tipo_str = f"CARROSSEL ({slide_count} slides)" if is_carousel else "POST ESTÁTICO"

    msg = (
        f"TIPO: {tipo_str}\n"
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}"
    )

    if is_carousel and slides_content:
        msg += (
            f"\n\n--- CONTEÚDO DOS SLIDES (extraído por I.A visão) ---\n"
            f"{slides_content}\n\n"
            f"TEMA GERAL DO CARROSSEL: {tema_geral}"
        )
    else:
        msg += f"\n\nIMAGEM: {image_url}"

    msg += f"\n\nLINK DO POST: {post_url}"
    return msg


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


def _build_hooks_user_message(item: dict, analysis: dict, slides_content: str) -> str:
    username = normalize_owner_username(item)
    caption = normalize_caption(item)
    post_url = normalize_post_url(item)

    return (
        f"PERFIL DE ORIGEM: @{username}\n\n"
        f"LEGENDA ORIGINAL:\n{caption}\n\n"
        f"TEXTO DOS SLIDES:\n{slides_content}\n\n"
        f"ANALISE PRINCIPAL:\n{analysis}\n\n"
        f"LINK DO POST: {post_url}"
    )


async def process_carrossel(webhook_body: dict):
    """
    Ponto de entrada do fluxo carrossel.
    webhook_body é o body do POST recebido do Apify.
    """
    resource = webhook_body.get("resource", {})
    dataset_id = resource.get("defaultDatasetId")
    kv_store_id = resource.get("defaultKeyValueStoreId")

    if not dataset_id:
        logger.error("[carrossel] dataset_id ausente no webhook body")
        return

    logger.info(f"[carrossel] dataset_id={dataset_id}")

    # 1. Buscar profile_id do INPUT do Apify (ou do body)
    profile_id = webhook_body.get("profile_id", "")
    source = webhook_body.get("source", "")
    hashtag_collection_id = webhook_body.get("hashtag_collection_id") or None
    post_source = source if source else "profile"
    saved_count = 0
    if not profile_id and kv_store_id:
        try:
            apify_input = await fetch_apify_input(kv_store_id)
            profile_id = apify_input.get("profile_id", "")
        except Exception as e:
            logger.warning(f"[carrossel] Não conseguiu buscar INPUT Apify: {e}")

    if not profile_id:
        logger.error("[carrossel] profile_id ausente — abortando")
        return

    # Buscar custom_prompt do perfil direto do Supabase (mais confiável que webhook)
    custom_prompt = await get_profile_custom_prompt(profile_id)
    logger.info(f"[carrossel] custom_prompt do Supabase: '{custom_prompt[:100] if custom_prompt else '(vazio)'}'")

    # 2. Buscar dataset Apify
    items = await fetch_apify_dataset(dataset_id)
    logger.info(f"[carrossel] {len(items)} itens no dataset")

    # 3. Filtrar apenas carrosseis
    filtered = _filter_carrossel(items)
    logger.info(f"[carrossel] {len(filtered)} carrosseis após filtro")

    # 4. Buscar client_name no Supabase
    client_name = await get_client_name(profile_id)

    # 5. Processar cada item
    for item in filtered:
        post_id = safe_post_id(item)

        try:
            # Detectar slides
            is_carousel, slide_urls = _extract_carousel_slides(item)
            item["is_carousel"] = is_carousel
            item["carousel_slides"] = slide_urls
            item["slide_count"] = len(slide_urls)

            # Vision API para extrair conteúdo dos slides
            slides_content = ""
            transcricao_formatada = ""
            tema_geral = ""
            if is_carousel and slide_urls:
                vision_resp = await _call_vision_api(slide_urls)
                slides_content, tema_geral = _parse_vision_response(vision_resp)
                transcricao_formatada = _format_transcricao(slides_content)

            item["slides_content"] = slides_content
            item["tema_geral_carousel"] = tema_geral

            # Chamar Claude
            user_msg = _build_user_message(item, slides_content, tema_geral)
            system_prompt, resolved_prompt = resolve_system_prompt(SYSTEM_GENERIC, custom_prompt)
            raw_llm = await call_claude(
                system=system_prompt,
                user_message=user_msg,
                model=CLAUDE_MODEL_CARROSSEL,
                custom_prompt=resolved_prompt,
            )
            analysis = parse_llm_json(raw_llm)
            analysis["transcricao"] = slides_content
            analysis["transcricao_formatada"] = transcricao_formatada

            # Dados consolidados
            curtidas = normalize_likes_count(item)
            visualizacoes = normalize_comments_count(item)
            thumbnail_url = normalize_thumbnail_url(item)
            post_url = normalize_post_url(item)
            caption = normalize_caption(item)
            media_type = "carousel" if is_carousel else "image"

            # 6. Salvar inspiration_post
            insp_id = await save_inspiration_post({
                "profile_id":    profile_id,
                "post_id":       post_id,
                "post_url":      post_url,
                "caption":       caption,
                "media_type":    media_type,
                "thumbnail_url": thumbnail_url,
                "analysis":      analysis,
                "curtidas":      curtidas,
                "visualizacoes": visualizacoes,
                "envios":        0,
                "transcricao_formatada": transcricao_formatada,
                "transcricao":   slides_content,  # slides como transcrição
                "source":        post_source,
                "hashtag_collection_id": hashtag_collection_id,
            })

            # 7. Verificar descartar
            descartar = analysis.get("descartar", False)
            if not descartar or source == "specific":
                hooks_user_msg = _build_hooks_user_message(item, analysis, slides_content)
                raw_hooks = await call_claude(
                    system=HOOKS_MAGNETICOS_SYSTEM,
                    user_message=hooks_user_msg,
                    model=CLAUDE_MODEL_CARROSSEL,
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
                    "media_type":             media_type,
                    "tema":                   analysis.get("tema"),
                    "gancho":                 analysis.get("gancho"),
                    "sugestao_readaptacao":   analysis.get("sugestao_readaptacao"),
                    "score_relevancia":       analysis.get("score_relevancia"),
                    "curtidas":               curtidas,
                    "visualizacoes":          visualizacoes,
                    "envios":                 0,
                    "status":                 "pendente",
                    "transcricao":            slides_content,
                    "hooks_magneticos":       hooks_magneticos,
                    "source":                 post_source,
                    "hashtag_collection_id":  hashtag_collection_id,
                })
                saved_count += 1
                logger.info(f"[carrossel] ✓ post {post_id} salvo (insp_id={insp_id})")
            else:
                logger.info(f"[carrossel] ✗ post {post_id} descartado pela IA")

        except Exception as e:
            logger.exception(f"[carrossel] Erro processando post {post_id}: {e}")

    await mark_profile_scraped(profile_id)
    if hashtag_collection_id:
        await update_hashtag_collection(hashtag_collection_id, add_posts=saved_count, status="done")
