"""
Ranqueia posts coletados e sugere como adaptar os melhores para uma marca.
Usa score local para ordenar e Claude para enriquecer a curadoria final.
"""

import json
import logging
import re
from datetime import datetime, timezone

from config import CLAUDE_MODEL_VIDEOS
from utils import call_claude, parse_llm_json

logger = logging.getLogger(__name__)

BESTCONTENT_SYSTEM = """
Voce atua como curador de best content para marketing.
Recebera uma lista de posts ja ranqueados com metricas e contexto da marca.

Responda apenas com JSON valido neste formato:
{
  "adaptacoes": [
    {
      "rank_id": "id do ranking recebido",
      "adaptacao_sugerida": "como adaptar esse conteudo para a marca",
      "motivo_estrategico": "por que vale adaptar",
      "formato_recomendado": "reels, carrossel, anuncio, etc"
    }
  ]
}

Regras:
- Responda no maximo para os 5 melhores posts recebidos.
- Priorize sugestoes praticas e acionaveis.
- Considere o contexto da marca como prioridade.
- Nao use markdown.
"""


def _normalize_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _safe_number(value) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[^0-9.,-]", "", value).replace(",", ".")
        try:
            return float(cleaned)
        except ValueError:
            return 0.0
    return 0.0


def _parse_datetime(value) -> datetime | None:
    text = _normalize_text(value)
    if not text:
        return None

    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _extract_analysis(post: dict) -> dict:
    analysis = post.get("analysis") or post.get("full_analysis") or {}
    if not isinstance(analysis, dict):
        return {}
    return analysis


def _extract_text_blob(post: dict) -> str:
    analysis = _extract_analysis(post)
    parts = [
        post.get("caption"),
        post.get("original_caption"),
        post.get("body_text"),
        post.get("transcricao"),
        post.get("transcricao_formatada"),
        post.get("headline"),
        post.get("tema"),
        post.get("gancho"),
        analysis.get("tema"),
        analysis.get("gancho"),
        analysis.get("estrutura"),
        analysis.get("sugestao_readaptacao"),
    ]
    return " ".join(_normalize_text(part) for part in parts if _normalize_text(part))


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-zA-Z0-9_]{3,}", text.lower())
        if token
    }


def _score_engagement_relative(post: dict, max_signal: float) -> float:
    likes = _safe_number(post.get("curtidas"))
    views = _safe_number(post.get("visualizacoes"))
    sends = _safe_number(post.get("envios"))
    raw_signal = likes + (views * 0.35) + (sends * 0.75)
    if max_signal <= 0:
        return 0.0
    return round(min(10.0, (raw_signal / max_signal) * 10.0), 2)


def _score_relevance(post: dict, marca_contexto: str) -> float:
    if not marca_contexto.strip():
        return 5.0

    context_tokens = _tokenize(marca_contexto)
    if not context_tokens:
        return 5.0

    post_tokens = _tokenize(_extract_text_blob(post))
    if not post_tokens:
        return 0.0

    overlap = len(context_tokens & post_tokens)
    return round(min(10.0, (overlap / max(1, len(context_tokens))) * 10.0), 2)


def _score_originality(post: dict) -> float:
    blob = _extract_text_blob(post)
    if not blob:
        return 0.0

    tokens = re.findall(r"[a-zA-Z0-9_]{3,}", blob.lower())
    unique_ratio = len(set(tokens)) / max(1, len(tokens))
    base_score = min(8.0, unique_ratio * 10.0)
    bonus = 2.0 if len(blob) > 280 else 0.0
    return round(min(10.0, base_score + bonus), 2)


def _score_replication(post: dict) -> float:
    analysis = _extract_analysis(post)
    checks = [
        bool(_normalize_text(post.get("transcricao"))),
        bool(_normalize_text(post.get("transcricao_formatada"))),
        bool(_normalize_text(post.get("caption") or post.get("body_text"))),
        bool(_normalize_text(post.get("gancho") or analysis.get("gancho"))),
        bool(_normalize_text(post.get("tema") or analysis.get("tema"))),
        bool(_normalize_text(analysis.get("estrutura") or post.get("sugestao_readaptacao"))),
    ]
    return round((sum(checks) / len(checks)) * 10.0, 2)


def _score_trending(post: dict) -> float:
    published_at = (
        _parse_datetime(post.get("created_at"))
        or _parse_datetime(post.get("start_date"))
        or _parse_datetime(post.get("published_at"))
    )
    if not published_at:
        return 5.0

    age_days = max(0.0, (datetime.now(timezone.utc) - published_at).total_seconds() / 86400)
    recency_score = max(0.0, 10.0 - min(age_days, 30.0) / 3.0)
    return round(recency_score, 2)


def _build_ranked_post(post: dict, rank_id: str, max_signal: float, marca_contexto: str) -> dict:
    analysis = _extract_analysis(post)
    engagement = _score_engagement_relative(post, max_signal)
    relevance = _score_relevance(post, marca_contexto)
    originality = _score_originality(post)
    replication = _score_replication(post)
    trending = _score_trending(post)

    total = round(
        (engagement * 0.30)
        + (relevance * 0.25)
        + (originality * 0.15)
        + (replication * 0.15)
        + (trending * 0.15),
        2,
    )

    return {
        "rank_id": rank_id,
        "post_id": post.get("post_id") or post.get("id") or rank_id,
        "media_type": post.get("media_type") or post.get("creative_type") or "unknown",
        "tema": post.get("tema") or analysis.get("tema") or "",
        "gancho": post.get("gancho") or analysis.get("gancho") or "",
        "texto_base": _extract_text_blob(post)[:500],
        "scores": {
            "engajamento_relativo": engagement,
            "relevancia": relevance,
            "originalidade": originality,
            "replicacao": replication,
            "trending": trending,
            "total": total,
        },
        "fonte_original": {
            "curtidas": _safe_number(post.get("curtidas")),
            "visualizacoes": _safe_number(post.get("visualizacoes")),
            "envios": _safe_number(post.get("envios")),
            "created_at": post.get("created_at") or post.get("start_date") or post.get("published_at"),
        },
    }


async def _generate_adaptations(ranked_posts: list[dict], marca_contexto: str) -> dict[str, dict]:
    # Usa uma unica chamada ao Claude para enriquecer a adaptacao dos top posts.
    if not ranked_posts:
        return {}

    payload = [
        {
            "rank_id": post["rank_id"],
            "tema": post["tema"],
            "gancho": post["gancho"],
            "media_type": post["media_type"],
            "scores": post["scores"],
            "texto_base": post["texto_base"],
        }
        for post in ranked_posts[:5]
    ]

    raw = await call_claude(
        system=BESTCONTENT_SYSTEM,
        user_message=(
            f"MARCA_CONTEXTO:\n{marca_contexto or 'Nao informado'}\n\n"
            "POSTS RANQUEADOS:\n"
            f"{json.dumps(payload, ensure_ascii=True, indent=2)}"
        ),
        model=CLAUDE_MODEL_VIDEOS,
    )
    parsed = parse_llm_json(raw)

    if not isinstance(parsed, dict):
        return {}

    adaptacoes = parsed.get("adaptacoes", [])
    if not isinstance(adaptacoes, list):
        return {}

    return {
        item.get("rank_id"): item
        for item in adaptacoes
        if isinstance(item, dict) and item.get("rank_id")
    }


async def rank_and_curate(posts: list, marca_contexto: str) -> dict:
    if not isinstance(posts, list):
        return {"error": "posts_must_be_a_list"}

    raw_signals = [
        _safe_number(post.get("curtidas"))
        + (_safe_number(post.get("visualizacoes")) * 0.35)
        + (_safe_number(post.get("envios")) * 0.75)
        for post in posts
        if isinstance(post, dict)
    ]
    max_signal = max(raw_signals) if raw_signals else 0.0

    ranked_posts = []
    for index, post in enumerate(posts, start=1):
        if not isinstance(post, dict):
            continue
        rank_id = f"post_{index}"
        ranked_posts.append(_build_ranked_post(post, rank_id, max_signal, marca_contexto))

    ranked_posts.sort(key=lambda item: item["scores"]["total"], reverse=True)
    for position, item in enumerate(ranked_posts, start=1):
        item["ranking_posicao"] = position

    adaptacoes = await _generate_adaptations(ranked_posts, marca_contexto)
    for item in ranked_posts:
        adaptacao = adaptacoes.get(item["rank_id"], {})
        item["adaptacao_sugerida"] = adaptacao.get("adaptacao_sugerida", "")
        item["motivo_estrategico"] = adaptacao.get("motivo_estrategico", "")
        item["formato_recomendado"] = adaptacao.get("formato_recomendado", "")

    media_types = {}
    for item in ranked_posts:
        media_type = item.get("media_type") or "unknown"
        media_types[media_type] = media_types.get(media_type, 0) + 1

    media_types = dict(
        sorted(media_types.items(), key=lambda pair: (-pair[1], pair[0]))
    )

    average_score = 0.0
    if ranked_posts:
        average_score = round(
            sum(item["scores"]["total"] for item in ranked_posts) / len(ranked_posts),
            2,
        )

    return {
        "marca_contexto": marca_contexto,
        "total_posts_recebidos": len(posts),
        "total_posts_ranqueados": len(ranked_posts),
        "score_medio": average_score,
        "mix_midias": media_types,
        "posts_ranqueados": ranked_posts,
    }
