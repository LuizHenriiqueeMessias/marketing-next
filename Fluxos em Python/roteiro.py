"""
Gera roteiros de pauta quente a partir do conteudo recente ja coletado.
Usa o banco como fonte de sinais de trending para evitar dependencias extras.
"""

import json
import logging

from config import CLAUDE_MODEL_VIDEOS
from utils import call_claude, parse_llm_json, supabase_get

logger = logging.getLogger(__name__)

ROTEIRO_PAUTA_QUENTE_SYSTEM = """
Voce cria roteiros de pauta quente para conteudo de redes sociais.
Use o contexto de tendencias fornecido para identificar angulos atuais e adaptaveis.

Responda apenas com JSON valido neste formato:
{
  "tema_quente": "tema principal",
  "insight_central": "o por que esse tema esta em alta",
  "angulo_recomendado": "angulo editorial para a marca",
  "gancho": "frase curta de abertura",
  "roteiro": {
    "abertura": "primeiras falas",
    "desenvolvimento": [
      "bloco 1",
      "bloco 2",
      "bloco 3"
    ],
    "fechamento": "fechamento do roteiro",
    "cta": "chamada para acao"
  },
  "assets_sugeridos": [
    "asset 1",
    "asset 2",
    "asset 3"
  ],
  "referencias_trending": [
    "referencia 1",
    "referencia 2",
    "referencia 3"
  ]
}

Regras:
- Considere nicho, formato, persona e tom informados.
- Traga um roteiro pratico, gravavel e atual.
- Nao use markdown.
"""


def _normalize_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _truncate(text: str, limit: int) -> str:
    normalized = _normalize_text(text)
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 3].rstrip() + "..."


def _extract_post_signal(post: dict) -> dict:
    # Reduz cada post a um sinal curto e reaproveitavel para o prompt de trending.
    analysis = post.get("analysis") or {}
    if not isinstance(analysis, dict):
        analysis = {}

    return {
        "media_type": post.get("media_type") or "",
        "caption": _truncate(post.get("caption") or "", 220),
        "tema": _truncate(analysis.get("tema") or "", 120),
        "gancho": _truncate(analysis.get("gancho") or "", 120),
        "score_relevancia": analysis.get("score_relevancia"),
        "curtidas": post.get("curtidas") or 0,
        "visualizacoes": post.get("visualizacoes") or 0,
        "envios": post.get("envios") or 0,
        "created_at": post.get("created_at") or "",
    }


async def _fetch_trending_posts(limit: int = 15) -> list[dict]:
    # Busca conteudos recentes do banco para servir como base de tendencias.
    try:
        return await supabase_get(
            "inspiration_posts"
            "?select=caption,media_type,analysis,curtidas,visualizacoes,envios,created_at"
            "&order=created_at.desc"
            f"&limit={limit}"
        )
    except Exception as exc:
        logger.warning(f"[roteiro] falha ao buscar inspiration_posts: {exc}")
        return []


def _build_trending_context(posts: list[dict]) -> str:
    # Resume os principais sinais em JSON curto para facilitar a leitura do modelo.
    signals = [_extract_post_signal(post) for post in posts]
    return json.dumps(signals, ensure_ascii=True, indent=2)


async def generate_roteiro(
    nicho: str,
    formato: str,
    persona: str,
    tom: str,
) -> dict:
    posts = await _fetch_trending_posts()
    trending_context = _build_trending_context(posts)

    user_message = (
        f"NICHO: {nicho}\n"
        f"FORMATO: {formato}\n"
        f"PERSONA: {persona or 'Nao informada'}\n"
        f"TOM: {tom or 'Nao informado'}\n\n"
        "Use os sinais abaixo como base do que esta funcionando e do que esta em alta.\n"
        "Se algum sinal nao servir ao nicho, descarte e priorize os mais aderentes.\n\n"
        f"TRENDS RECENTES DO BANCO:\n{trending_context}"
    )

    raw = await call_claude(
        system=ROTEIRO_PAUTA_QUENTE_SYSTEM,
        user_message=user_message,
        model=CLAUDE_MODEL_VIDEOS,
    )
    result = parse_llm_json(raw)

    if not isinstance(result, dict):
        result = {"error": "invalid_response", "raw": raw[:500]}

    result["input"] = {
        "nicho": nicho,
        "formato": formato,
        "persona": persona,
        "tom": tom,
    }
    result["contexto_trending"] = {
        "fonte": "inspiration_posts",
        "posts_analisados": len(posts),
        "amostra": [_extract_post_signal(post) for post in posts[:5]],
    }
    return result
