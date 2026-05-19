"""Configuracao do Marketing Next.

Este arquivo e seguro para versionamento publico: credenciais reais devem ficar
apenas em variaveis de ambiente ou em um arquivo .env local nao versionado.
"""

from __future__ import annotations

import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default)


APIFY_TOKEN = _env("APIFY_TOKEN")
APIFY_ACTOR_ID = _env("APIFY_ACTOR_ID")
APIFY_INSTAGRAM_REEL_ACTOR_ID = _env("APIFY_INSTAGRAM_REEL_ACTOR_ID")
APIFY_TIKTOK_ACTOR_ID = _env("APIFY_TIKTOK_ACTOR_ID")
APIFY_YOUTUBE_ACTOR_ID = _env("APIFY_YOUTUBE_ACTOR_ID")
APIFY_YOUTUBE_TRANSCRIPT_ACTOR_ID = _env("APIFY_YOUTUBE_TRANSCRIPT_ACTOR_ID")

SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_ANON = _env("SUPABASE_ANON")
SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY")
_auth_key = SUPABASE_SERVICE_KEY or SUPABASE_ANON
SUPABASE_HEADERS = {
    "apikey": _auth_key,
    "Authorization": f"Bearer {_auth_key}" if _auth_key else "",
    "Content-Type": "application/json",
}

ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY")
OPENROUTER_API_KEY = _env("OPENROUTER_API_KEY")
OPENROUTER_VISION_MODEL = _env("OPENROUTER_VISION_MODEL", "openai/gpt-4o-mini")
GROQ_API_KEY = _env("GROQ_API_KEY")

CLAUDE_MODEL_ESTATICOS = _env("CLAUDE_MODEL_ESTATICOS", "claude-3-5-sonnet-latest")
CLAUDE_MODEL_CARROSSEL = _env("CLAUDE_MODEL_CARROSSEL", "claude-3-5-sonnet-latest")
CLAUDE_MODEL_VIDEOS = _env("CLAUDE_MODEL_VIDEOS", "claude-3-5-sonnet-latest")
CLAUDE_MODEL_TIKTOK = _env("CLAUDE_MODEL_TIKTOK", "claude-3-5-sonnet-latest")
CLAUDE_MODEL_YOUTUBE = _env("CLAUDE_MODEL_YOUTUBE", "claude-3-5-sonnet-latest")
CLAUDE_MODEL_ADS = _env("CLAUDE_MODEL_ADS", "claude-3-5-sonnet-latest")

BACKEND_URL = _env("BACKEND_URL")
FACEBOOK_ADS_ACTOR_ID = _env("FACEBOOK_ADS_ACTOR_ID")

SCHEDULER_CRON_DAY_OF_WEEK = _env("SCHEDULER_CRON_DAY_OF_WEEK", "*")
SCHEDULER_CRON_HOUR = _env("SCHEDULER_CRON_HOUR", "9")
SCHEDULER_CRON_MINUTE = _env("SCHEDULER_CRON_MINUTE", "0")
SCHEDULER_MIN_INTERVAL_DAYS = int(_env("SCHEDULER_MIN_INTERVAL_DAYS", "1"))
