from fastapi import APIRouter, Depends, Query
from core.deps import get_current_tenant
from core import db as dbmod

router = APIRouter(prefix="/comments", tags=["comments"])


@router.get("")
async def list_comments(
    ctx=Depends(get_current_tenant),
    page_id: str | None = None,
    sentiment: str | None = None,
    category: str | None = None,
    status: str | None = None,
    limit: int = Query(100, le=500),
):
    tid = ctx["tenant"]["id"]
    q = {"tenant_id": tid}
    if page_id:
        q["page_id"] = page_id
    if sentiment:
        q["sentiment"] = sentiment
    if category:
        q["category"] = category
    if status:
        q["status"] = status
    items = await dbmod.comments.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items
