from fastapi import APIRouter, Depends, Query
from core.deps import get_current_tenant
from core import db as dbmod

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
async def list_audit(ctx=Depends(get_current_tenant), limit: int = Query(200, le=1000)):
    tid = ctx["tenant"]["id"]
    items = await dbmod.audit_logs.find({"tenant_id": tid}, {"_id": 0}).sort("at", -1).to_list(limit)
    return items
