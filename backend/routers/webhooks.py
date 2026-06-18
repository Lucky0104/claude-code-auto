"""Meta webhooks for the Crysta IVF auto-comment bot.

Verification endpoint is unchanged. The POST handler stores the raw event
then processes it via a background task so we can return 200 immediately
(Meta retries if it doesn't get a fast 200).
"""
import os
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pymongo.errors import DuplicateKeyError

from core import db as dbmod
from core import meta
from core import observability as obs
from core.security import decrypt_token

GRAPH = f"https://graph.facebook.com/{os.environ['FB_GRAPH_VERSION']}"
VERIFY_TOKEN = os.environ['FB_WEBHOOK_VERIFY_TOKEN']

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
log = logging.getLogger("webhooks")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/meta")
async def meta_verify(request: Request):
    qs = request.query_params
    if qs.get("hub.mode") == "subscribe" and qs.get("hub.verify_token") == VERIFY_TOKEN:
        challenge = qs.get("hub.challenge", "")
        return Response(content=challenge, media_type="text/plain")
    raise HTTPException(403, "Verification failed")


@router.post("/meta")
async def meta_webhook(request: Request, bg: BackgroundTasks):
    body = await request.body()
    sig = request.headers.get("x-hub-signature-256")
    if not meta.verify_signature(body, sig):
        raise HTTPException(401, "Invalid signature")
    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    # Persist event for audit/debug, then process in background
    try:
        await dbmod.webhook_events.insert_one({"received_at": _now_iso(), "payload": payload})
    except Exception:
        log.exception("failed to persist webhook event")

    bg.add_task(_process_payload, payload)
    obs.inc("webhook.received")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Background processing
# ---------------------------------------------------------------------------
async def _get_first_active_page_token(tenant_id: str) -> Optional[str]:
    cursor = dbmod.pages.find(
        {
            "tenant_id": tenant_id,
            "$or": [{"is_active": True}, {"active": True}],
        }
    ).sort("connected_at", 1)
    page = await cursor.to_list(1)
    if not page:
        page = await dbmod.pages.find({"tenant_id": tenant_id}).sort("connected_at", 1).to_list(1)
    if not page:
        return None
    enc = page[0].get("access_token_enc")
    return decrypt_token(enc) if enc else None


def _render_reply(campaign: dict) -> str:
    fields = {
        "doctor_name": campaign.get("doctor_name") or "",
        "center_name": campaign.get("center_name") or "",
        "phone": campaign.get("phone") or "",
        "address": campaign.get("address") or "",
        "whatsapp": campaign.get("whatsapp") or "",
    }
    template = campaign.get("reply_template")
    if template:
        out = template
        for k, v in fields.items():
            out = out.replace("{" + k + "}", v)
        return out.strip()
    return (
        f"Hi! Thanks for your interest. You can consult {fields['doctor_name']} "
        f"at our {fields['center_name']} centre. "
        f"\U0001F4DE {fields['phone']}  \U0001F4CD {fields['address']}"
    ).strip()


async def _process_payload(payload: dict) -> None:
    try:
        for entry in payload.get("entry", []) or []:
            for change in entry.get("changes", []) or []:
                value = change.get("value", {}) or {}
                # Only proceed for new comments
                verb = value.get("verb")
                if verb and verb != "add":
                    continue
                comment_id = value.get("comment_id") or value.get("id")
                media = value.get("media") or {}
                media_id = (
                    value.get("media_id")
                    or media.get("id")
                    or value.get("post_id")
                )
                if not comment_id or not media_id:
                    continue
                await _process_one_comment(comment_id, str(media_id), value)
    except Exception:
        log.exception("webhook background processing failed")


async def _process_one_comment(comment_id: str, media_id: str, value: dict) -> None:
    # 1) Dedup
    try:
        if await dbmod.comment_logs.find_one({"comment_id": comment_id}):
            obs.inc("webhook.deduped")
            return
    except Exception:
        log.exception("dedup lookup failed")
        return

    # 2) Is this post being monitored?
    monitored = await dbmod.monitored_posts.find_one(
        {"instagram_post_id": media_id, "is_active": True}
    )
    if not monitored:
        return

    # 3) Find campaign
    campaign = await dbmod.campaigns.find_one({"_id": monitored["campaign_id"]})
    if not campaign:
        return
    if not campaign.get("is_configured"):
        return

    tenant_id = monitored.get("tenant_id") or campaign.get("tenant_id")
    page_token = await _get_first_active_page_token(tenant_id)
    if not page_token:
        log.warning("no active page token for tenant %s", tenant_id)
        return

    commenter = value.get("from") or {}
    commenter_id = commenter.get("id") or value.get("from_id") or ""
    comment_text = value.get("text") or value.get("message") or ""

    reply_text = _render_reply(campaign)
    status = "replied"
    reply_sent_text = reply_text
    error_msg = None
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                f"{GRAPH}/{comment_id}/replies",
                data={"message": reply_text, "access_token": page_token},
            )
        if r.status_code >= 400:
            status = "failed"
            try:
                error_msg = r.json().get("error", {}).get("message", "")
            except Exception:
                error_msg = r.text[:200]
    except Exception as e:
        status = "failed"
        error_msg = str(e)[:200]

    if status == "replied":
        obs.inc("reply.success")
    else:
        obs.inc("reply.failed")

    log_doc = {
        "comment_id": comment_id,
        "campaign_id": monitored["campaign_id"],
        "instagram_post_id": media_id,
        "instagram_permalink": monitored.get("instagram_permalink"),
        "tenant_id": tenant_id,
        "commenter_id": commenter_id,
        "commenter_name": commenter.get("name", ""),
        "comment_text": comment_text,
        "reply_sent": reply_sent_text if status == "replied" else "",
        "replied_at": _now_iso(),
        "status": status,
        "error": error_msg,
    }
    try:
        await dbmod.comment_logs.insert_one(log_doc)
    except DuplicateKeyError:
        # Concurrent webhook delivery — already handled
        obs.inc("webhook.deduped")
        return
    except Exception:
        log.exception("failed to insert comment_log")

    obs.log_event(
        log,
        "webhook.reply",
        status=status,
        campaign_id=monitored["campaign_id"],
        tenant_id=tenant_id,
        comment_id=comment_id,
    )
