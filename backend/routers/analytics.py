from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
from core.deps import get_current_tenant
from core import db as dbmod

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def overview(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    today = datetime.now(timezone.utc).date().isoformat()
    today_filter = {"tenant_id": tid, "created_at": {"$gte": today}}
    total_comments_today = await dbmod.comments.count_documents(today_filter)
    ai_replies_today = await dbmod.replies.count_documents({"tenant_id": tid, "auto": True, "posted_at": {"$gte": today}})
    pending_approvals = await dbmod.approvals.count_documents({"tenant_id": tid, "status": "pending"})
    negative_comments = await dbmod.comments.count_documents({"tenant_id": tid, "sentiment": "negative"})
    total_leads = await dbmod.leads.count_documents({"tenant_id": tid})
    pages_count = await dbmod.pages.count_documents({"tenant_id": tid})
    ig_count = await dbmod.ig_accounts.count_documents({"tenant_id": tid})
    return {
        "total_comments_today": total_comments_today,
        "ai_replies_today": ai_replies_today,
        "pending_approvals": pending_approvals,
        "negative_comments": negative_comments,
        "total_leads": total_leads,
        "pages_connected": pages_count,
        "instagram_connected": ig_count,
    }


@router.get("/sentiment-trend")
async def sentiment_trend(ctx=Depends(get_current_tenant), days: int = 7):
    tid = ctx["tenant"]["id"]
    out = []
    for i in range(days - 1, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).date().isoformat()
        next_day = (datetime.now(timezone.utc) - timedelta(days=i - 1)).date().isoformat()
        q = {"tenant_id": tid, "created_at": {"$gte": day, "$lt": next_day}}
        pos = await dbmod.comments.count_documents({**q, "sentiment": "positive"})
        neu = await dbmod.comments.count_documents({**q, "sentiment": "neutral"})
        neg = await dbmod.comments.count_documents({**q, "sentiment": "negative"})
        out.append({"date": day, "positive": pos, "neutral": neu, "negative": neg})
    return out


@router.get("/categories")
async def categories(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    pipeline = [
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    cur = dbmod.comments.aggregate(pipeline)
    return [{"category": d["_id"] or "unknown", "count": d["count"]} async for d in cur]


@router.get("/top-pages")
async def top_pages(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    pipeline = [
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$page_id", "comments": {"$sum": 1}}},
        {"$sort": {"comments": -1}},
        {"$limit": 5},
    ]
    out = []
    async for d in dbmod.comments.aggregate(pipeline):
        page = await dbmod.pages.find_one({"tenant_id": tid, "page_id": d["_id"]}, {"_id": 0, "access_token_enc": 0})
        out.append({"page": page, "comments": d["comments"]})
    return out
