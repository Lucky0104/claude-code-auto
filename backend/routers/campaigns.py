"""
Campaigns router (Crysta IVF auto-comment bot).

Each campaign maps to ONE city centre / doctor / clinic. When someone
comments on an Instagram post boosted by that campaign, the bot posts a
PUBLIC COMMENT REPLY with the centre's doctor/address/phone details.

Note on deliverable scope: a feed endpoint for the Comments page
(`GET /api/campaigns/comment-logs`) is included here so we do not have
to touch the legacy comments router (Comments.jsx queries this).
"""
import os
import re
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.deps import get_current_tenant, require_role
from core import db as dbmod
from core import observability as obs
from core.security import decrypt_token
from core.ratelimit import check_cooldown, sync_cooldown_seconds
from core.sanitize import sanitize_field, sanitize_template

GRAPH = f"https://graph.facebook.com/{os.environ['FB_GRAPH_VERSION']}"

router = APIRouter(prefix="/campaigns", tags=["campaigns"])
log = logging.getLogger("campaigns")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_first_active_page_token(tenant_id: str) -> Optional[str]:
    """Returns the decrypted page access token of the first active FB page
    connected for this tenant (sorted oldest first). Existing data uses
    'active' + 'connected_at'; spec calls it 'is_active' + 'created_at' so
    we match either.
    """
    cursor = dbmod.pages.find(
        {
            "tenant_id": tenant_id,
            "$or": [{"is_active": True}, {"active": True}],
        }
    ).sort("connected_at", 1)
    page = await cursor.to_list(1)
    if not page:
        # fallback: any page for this tenant
        page = await dbmod.pages.find({"tenant_id": tenant_id}).sort("connected_at", 1).to_list(1)
    if not page:
        return None
    enc = page[0].get("access_token_enc")
    if not enc:
        return None
    return decrypt_token(enc)


def _media_type_from_permalink(permalink: str) -> str:
    if not permalink:
        return "IMAGE"
    p = permalink.lower()
    if "/reel/" in p:
        return "REEL"
    if "/tv/" in p:
        return "VIDEO"
    return "IMAGE"


def _extract_ig_post_id_from_permalink(permalink: str) -> Optional[str]:
    """Pulls the shortcode from an instagram permalink like
    https://www.instagram.com/p/Cxyz123/ — we use it as a stable post id
    for monitored_posts (since the Graph media id isn't exposed via
    creative.instagram_permalink_url)."""
    if not permalink:
        return None
    m = re.search(r"/(?:p|reel|tv)/([^/?#]+)", permalink)
    return m.group(1) if m else None


def _render_reply(template: Optional[str], campaign: dict) -> str:
    fields = {
        "doctor_name": campaign.get("doctor_name", "") or "",
        "center_name": campaign.get("center_name", "") or "",
        "phone": campaign.get("phone", "") or "",
        "address": campaign.get("address", "") or "",
        "whatsapp": campaign.get("whatsapp", "") or "",
    }
    if template:
        out = template
        for k, v in fields.items():
            out = out.replace("{" + k + "}", v)
        return out.strip()
    # Default template
    return (
        f"Hi! Thanks for your interest. You can consult {fields['doctor_name']} "
        f"at our {fields['center_name']} centre. "
        f"\U0001F4DE {fields['phone']}  \U0001F4CD {fields['address']}"
    ).strip()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class CenterConfig(BaseModel):
    center_name: Optional[str] = None
    doctor_name: str = Field(..., min_length=1)
    address: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)
    whatsapp: Optional[str] = None
    reply_template: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes  (specific paths registered BEFORE parametric ones)
# ---------------------------------------------------------------------------
@router.get("/sync")
async def sync_campaigns(ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    tenant = ctx["tenant"]

    # Throttle expensive Meta syncs per tenant (in addition to Meta's own 429).
    allowed, retry_after = check_cooldown(f"sync:{tid}", sync_cooldown_seconds())
    if not allowed:
        raise HTTPException(
            429,
            f"Sync rate limit, try again in {retry_after}s",
            headers={"Retry-After": str(retry_after)},
        )

    ad_account_id = tenant.get("ad_account_id")
    if not ad_account_id:
        raise HTTPException(400, "No ad account found. Please reconnect Facebook.")

    page_token = await _get_first_active_page_token(tid)
    if not page_token:
        raise HTTPException(400, "Connect a Facebook page first to sync campaigns")

    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{GRAPH}/act_{ad_account_id}/campaigns",
                params={
                    "fields": "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,created_time",
                    "filtering": '[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]',
                    "limit": 100,
                    "access_token": page_token,
                },
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Meta API error: {e}")

    if r.status_code == 429:
        raise HTTPException(503, "Meta rate limit, try later")
    if r.status_code >= 400:
        detail = ""
        try:
            detail = r.json().get("error", {}).get("message", "")
        except Exception:
            detail = r.text[:200]
        raise HTTPException(502, f"Meta API error: {detail or r.status_code}")

    data = r.json().get("data", [])
    synced = []
    for camp in data:
        cid = camp["id"]
        update = {
            "tenant_id": tid,
            "name": camp.get("name", ""),
            "status": camp.get("status", ""),
            "objective": camp.get("objective", ""),
            "daily_budget": camp.get("daily_budget"),
            "lifetime_budget": camp.get("lifetime_budget"),
            "start_time": camp.get("start_time"),
            "stop_time": camp.get("stop_time"),
            "meta_created_time": camp.get("created_time"),
            "ad_account_id": ad_account_id,
            "meta_synced_at": _now_iso(),
        }
        # On insert only: initialise centre config fields to null/false.
        insert_defaults = {
            "_id": cid,
            "center_name": None,
            "doctor_name": None,
            "address": None,
            "phone": None,
            "whatsapp": None,
            "reply_template": None,
            "is_configured": False,
            "created_at": _now_iso(),
        }
        await dbmod.campaigns.update_one(
            {"_id": cid},
            {"$set": update, "$setOnInsert": insert_defaults},
            upsert=True,
        )
        doc = await dbmod.campaigns.find_one({"_id": cid})
        if doc:
            doc["id"] = doc.pop("_id")
            synced.append(doc)

    obs.inc("sync.runs")
    obs.inc("sync.campaigns_upserted", len(synced))
    obs.log_event(
        log, "campaigns.synced", tenant_id=tid, ad_account_id=ad_account_id, count=len(synced)
    )
    return {"count": len(synced), "campaigns": synced}


@router.get("/comment-logs")
async def list_comment_logs(
    ctx=Depends(get_current_tenant),
    campaign_id: Optional[str] = None,
    center_name: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(200, le=500),
):
    """Feed for the Comments page. Joins comment_logs with campaign info
    (campaign_name + center_name) for display."""
    tid = ctx["tenant"]["id"]

    # Resolve campaign_ids filtered by tenant + optional center/campaign filters
    cmatch = {"tenant_id": tid}
    if campaign_id:
        cmatch["_id"] = campaign_id
    if center_name:
        cmatch["center_name"] = center_name
    tenant_campaigns = await dbmod.campaigns.find(
        cmatch, {"_id": 1, "name": 1, "center_name": 1, "instagram_permalink": 1}
    ).to_list(1000)
    if not tenant_campaigns:
        return {"items": [], "count": 0}
    camp_map = {c["_id"]: c for c in tenant_campaigns}

    log_q: dict = {"campaign_id": {"$in": list(camp_map.keys())}}
    if status:
        log_q["status"] = status
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        log_q["replied_at"] = rng
    if q:
        log_q["$or"] = [
            {"comment_text": {"$regex": re.escape(q), "$options": "i"}},
            {"reply_sent": {"$regex": re.escape(q), "$options": "i"}},
            {"commenter_id": {"$regex": re.escape(q), "$options": "i"}},
        ]

    docs = (
        await dbmod.comment_logs.find(log_q, {"_id": 0})
        .sort("replied_at", -1)
        .to_list(limit)
    )
    for d in docs:
        c = camp_map.get(d.get("campaign_id"), {})
        d["campaign_name"] = c.get("name")
        d["center_name"] = c.get("center_name")
    return {"items": docs, "count": len(docs)}


@router.get("")
async def list_campaigns(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    docs = await dbmod.campaigns.find({"tenant_id": tid}).sort("meta_synced_at", -1).to_list(500)
    # Map _id -> id (for legacy AI-generated docs that use 'id' field, prefer that)
    out = []
    for d in docs:
        if "_id" in d:
            d["id"] = d.get("id") or d["_id"]
            d.pop("_id", None)
        out.append(d)
    # Attach monitored-post count for each campaign
    ids = [d["id"] for d in out]
    if ids:
        pipeline = [
            {"$match": {"campaign_id": {"$in": ids}, "is_active": True}},
            {"$group": {"_id": "$campaign_id", "n": {"$sum": 1}}},
        ]
        counts = {x["_id"]: x["n"] async for x in dbmod.monitored_posts.aggregate(pipeline)}
    else:
        counts = {}
    for d in out:
        d["monitored_posts_count"] = counts.get(d["id"], 0)
    return out


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    doc = await dbmod.campaigns.find_one({"_id": campaign_id, "tenant_id": tid})
    if not doc:
        # Fallback for legacy docs that used 'id' field
        doc = await dbmod.campaigns.find_one({"id": campaign_id, "tenant_id": tid})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    if "_id" in doc:
        doc["id"] = doc.get("id") or doc["_id"]
        doc.pop("_id", None)
    return doc


@router.patch("/{campaign_id}/center-config")
async def update_center_config(
    campaign_id: str,
    body: CenterConfig,
    ctx=Depends(require_role("owner", "admin")),
):
    tid = ctx["tenant"]["id"]
    update = {
        "center_name": sanitize_field(body.center_name),
        "doctor_name": sanitize_field(body.doctor_name),
        "address": sanitize_field(body.address),
        "phone": sanitize_field(body.phone),
        "whatsapp": sanitize_field(body.whatsapp),
        "reply_template": sanitize_template(body.reply_template),
        "is_configured": True,
        "configured_at": _now_iso(),
        "configured_by": ctx["user"]["id"],
    }
    res = await dbmod.campaigns.update_one(
        {"_id": campaign_id, "tenant_id": tid}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Campaign not found")
    obs.log_event(log, "campaign.configured", tenant_id=tid, campaign_id=campaign_id)
    doc = await dbmod.campaigns.find_one({"_id": campaign_id, "tenant_id": tid})
    if doc and "_id" in doc:
        doc["id"] = doc["_id"]
        doc.pop("_id", None)
    return doc


@router.get("/{campaign_id}/posts")
async def list_campaign_posts(campaign_id: str, ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    campaign = await dbmod.campaigns.find_one({"_id": campaign_id, "tenant_id": tid})
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    page_token = await _get_first_active_page_token(tid)
    if not page_token:
        raise HTTPException(400, "Connect a Facebook page first")

    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{GRAPH}/{campaign_id}/ads",
                params={
                    "fields": "id,name,status,creative{id,instagram_permalink_url,thumbnail_url,effective_object_story_id}",
                    "limit": 100,
                    "access_token": page_token,
                },
            )
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Meta network error: {e}")
    if r.status_code == 429:
        raise HTTPException(503, "Meta rate limit, try later")
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message", "")
        except Exception:
            msg = r.text[:200]
        raise HTTPException(502, f"Meta error: {msg or r.status_code}")

    ads = r.json().get("data", [])
    out = []
    for ad in ads:
        creative = ad.get("creative") or {}
        permalink = creative.get("instagram_permalink_url")
        if not permalink:
            continue
        post_id = _extract_ig_post_id_from_permalink(permalink) or creative.get("effective_object_story_id") or ad["id"]
        mon = await dbmod.monitored_posts.find_one(
            {"instagram_post_id": post_id, "tenant_id": tid}
        )
        is_monitoring = bool(mon and mon.get("is_active"))
        replies_sent = await dbmod.comment_logs.count_documents(
            {"instagram_post_id": post_id, "status": "replied"}
        )
        out.append(
            {
                "ad_id": ad["id"],
                "ad_name": ad.get("name", ""),
                "instagram_post_id": post_id,
                "instagram_permalink": permalink,
                "thumbnail_url": creative.get("thumbnail_url"),
                "media_type": _media_type_from_permalink(permalink),
                "is_monitoring": is_monitoring,
                "replies_sent": replies_sent,
            }
        )
    return out


@router.post("/{campaign_id}/posts/{post_id}/monitor")
async def start_monitoring(
    campaign_id: str,
    post_id: str,
    ctx=Depends(require_role("owner", "admin")),
):
    tid = ctx["tenant"]["id"]
    campaign = await dbmod.campaigns.find_one({"_id": campaign_id, "tenant_id": tid})
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    if not campaign.get("is_configured"):
        raise HTTPException(400, "Configure centre first")

    # Best-effort: capture permalink for the comment-logs feed
    permalink = None
    page_token = await _get_first_active_page_token(tid)
    if page_token:
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(
                    f"{GRAPH}/{campaign_id}/ads",
                    params={
                        "fields": "creative{instagram_permalink_url}",
                        "limit": 100,
                        "access_token": page_token,
                    },
                )
            if r.status_code < 400:
                for ad in r.json().get("data", []):
                    p = (ad.get("creative") or {}).get("instagram_permalink_url")
                    if p and _extract_ig_post_id_from_permalink(p) == post_id:
                        permalink = p
                        break
        except Exception:
            pass

    now = _now_iso()
    await dbmod.monitored_posts.update_one(
        {"instagram_post_id": post_id, "tenant_id": tid},
        {
            "$set": {
                "campaign_id": campaign_id,
                "instagram_post_id": post_id,
                "instagram_permalink": permalink,
                "tenant_id": tid,
                "is_active": True,
                "activated_at": now,
                "activated_by": ctx["user"]["id"],
            }
        },
        upsert=True,
    )
    return {"success": True, "is_monitoring": True}


@router.delete("/{campaign_id}/posts/{post_id}/monitor")
async def stop_monitoring(
    campaign_id: str,
    post_id: str,
    ctx=Depends(require_role("owner", "admin")),
):
    tid = ctx["tenant"]["id"]
    await dbmod.monitored_posts.update_one(
        {"instagram_post_id": post_id, "tenant_id": tid, "campaign_id": campaign_id},
        {"$set": {"is_active": False, "deactivated_at": _now_iso(), "deactivated_by": ctx["user"]["id"]}},
    )
    return {"success": True, "is_monitoring": False}
