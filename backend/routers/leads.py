from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from core.deps import get_current_tenant, require_role
from core import db as dbmod

router = APIRouter(prefix="/leads", tags=["leads"])


def _now(): return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_leads(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    items = await dbmod.leads.find({"tenant_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, status: str, ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    res = await dbmod.leads.update_one({"tenant_id": tid, "comment_id": lead_id}, {"$set": {"status": status, "updated_at": _now()}})
    if not res.matched_count:
        raise HTTPException(404, "Lead not found")
    return {"ok": True}


@router.post("/{lead_id}/generate-dm")
async def generate_dm(lead_id: str, ctx=Depends(require_role("owner", "admin"))):
    from core.ai import generate_dm_opener
    tid = ctx["tenant"]["id"]
    lead = await dbmod.leads.find_one({"tenant_id": tid, "comment_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")
    tenant = ctx["tenant"]
    kb_entries = await dbmod.kb.find({"tenant_id": tid}, {"_id": 0}).to_list(50)
    kb_summary = "\n".join([f"- {e['title']}: {e['content'][:140]}" for e in kb_entries])
    brand = {"name": tenant.get("business_name", ""), "tone": tenant.get("brand_tone", "")}
    try:
        dm = await generate_dm_opener(lead["message"], lead["from_name"], brand, kb_summary)
    except Exception as e:
        raise HTTPException(502, f"AI error: {e}")
    await dbmod.leads.update_one(
        {"tenant_id": tid, "comment_id": lead_id},
        {"$set": {"dm_draft": dm, "dm_generated_at": _now()}},
    )
    return {"ok": True, "dm": dm}
