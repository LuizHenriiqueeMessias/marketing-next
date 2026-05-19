"""
APScheduler — weekly ad collection for active competitors.
Per D-01: one collection per week per active competitor.
Per D-07: AsyncIOScheduler on FastAPI event loop.
Per D-08: jobs in memory only, rebuilt on startup.
"""
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import (
    SCHEDULER_CRON_DAY_OF_WEEK,
    SCHEDULER_CRON_HOUR,
    SCHEDULER_CRON_MINUTE,
    SCHEDULER_MIN_INTERVAL_DAYS,
    SUPABASE_HEADERS,
    SUPABASE_URL,
)
from utils import _client

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_weekly_collection() -> None:
    """Fetch active competitors and trigger collection for those due."""
    from flows.ad_intelligence import trigger_collection  # deferred import to avoid circular

    logger.info("[scheduler] weekly collection job started")

    # Fetch active competitors
    resp = await _client.get(
        f"{SUPABASE_URL}/rest/v1/ad_competitors?is_active=eq.true&select=id,page_id,last_collected_at",
        headers=SUPABASE_HEADERS,
    )
    resp.raise_for_status()
    competitors = resp.json()

    if not competitors:
        logger.info("[scheduler] no active competitors found — skipping")
        return

    cutoff = datetime.now(timezone.utc) - timedelta(days=SCHEDULER_MIN_INTERVAL_DAYS)
    triggered = 0

    for comp in competitors:
        last = comp.get("last_collected_at")
        if last:
            # Parse ISO timestamp
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
            if last_dt > cutoff:
                logger.info(f"[scheduler] skipping {comp['id']} — last collected {last}")
                continue

        page_id = comp.get("page_id")
        if not page_id:
            logger.warning(f"[scheduler] competitor {comp['id']} has no page_id — skipping")
            continue

        logger.info(f"[scheduler] triggering collection for competitor {comp['id']}")
        try:
            await trigger_collection(comp["id"], page_id)
            triggered += 1
        except Exception as e:
            logger.exception(f"[scheduler] failed to trigger for {comp['id']}: {e}")

    logger.info(f"[scheduler] weekly job complete — triggered {triggered}/{len(competitors)} competitors")


def start_scheduler() -> None:
    """Create and start the AsyncIOScheduler with weekly cron job."""
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _run_weekly_collection,
        trigger=CronTrigger(
            day_of_week=SCHEDULER_CRON_DAY_OF_WEEK,
            hour=SCHEDULER_CRON_HOUR,
            minute=SCHEDULER_CRON_MINUTE,
        ),
        id="weekly_ad_collection",
        name="Weekly Ad Intelligence Collection",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        f"[scheduler] started — cron: {SCHEDULER_CRON_DAY_OF_WEEK} "
        f"{SCHEDULER_CRON_HOUR:02d}:{SCHEDULER_CRON_MINUTE:02d} UTC"
    )


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        logger.info("[scheduler] shut down")
        _scheduler = None
