"""Operational metrics endpoint (tenant-scoped) for the Crysta IVF bot.

``GET /api/metrics`` returns reply success/failure counts, active monitoring
count, configured-campaign count, and the last sync time for the *current
tenant* (derived from the DB so the numbers survive restarts and never leak
across tenants), plus a process-local counter snapshot for real-time
webhook/sync throughput.
"""
import logging

from fastapi import APIRouter, Depends

from core.deps import get_current_tenant
from core import db as dbmod
from core import observability as obs

router = APIRouter(prefix="/metrics", tags=["metrics"])
log = logging.getLogger("metrics")


@router.get("")
async def get_metrics(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]

    # Campaign ids for this tenant (comment_logs are keyed by campaign_id).
    camp_ids = [c["_id"] async for c in dbmod.campaigns.find({"tenant_id": tid}, {"_id": 1})]
    campaigns_total = len(camp_ids)
    campaigns_configured = await dbmod.campaigns.count_documents(
        {"tenant_id": tid, "is_configured": True}
    )
    monitoring_active = await dbmod.monitored_posts.count_documents(
        {"tenant_id": tid, "is_active": True}
    )

    replies_sent = replies_failed = 0
    if camp_ids:
        replies_sent = await dbmod.comment_logs.count_documents(
            {"campaign_id": {"$in": camp_ids}, "status": "replied"}
        )
        replies_failed = await dbmod.comment_logs.count_documents(
            {"campaign_id": {"$in": camp_ids}, "status": "failed"}
        )
    replies_total = replies_sent + replies_failed
    success_rate = round(replies_sent / replies_total, 4) if replies_total else None

    last = (
        await dbmod.campaigns.find(
            {"tenant_id": tid, "meta_synced_at": {"$ne": None}}, {"meta_synced_at": 1}
        )
        .sort("meta_synced_at", -1)
        .to_list(1)
    )
    last_sync_at = last[0]["meta_synced_at"] if last else None

    return {
        "tenant_id": tid,
        "campaigns_total": campaigns_total,
        "campaigns_configured": campaigns_configured,
        "monitoring_active": monitoring_active,
        "replies_total": replies_total,
        "replies_sent": replies_sent,
        "replies_failed": replies_failed,
        "reply_success_rate": success_rate,
        "last_sync_at": last_sync_at,
        "process": obs.snapshot(),
    }
