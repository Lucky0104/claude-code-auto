from fastapi import APIRouter, Depends, HTTPException
from core.deps import get_current_tenant, require_role
from core import db as dbmod
from core.models import KBEntry, KBEntryCreate

router = APIRouter(prefix="/kb", tags=["knowledge-base"])


@router.get("")
async def list_kb(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    return await dbmod.kb.find({"tenant_id": tid}, {"_id": 0}).to_list(500)


@router.post("")
async def create_kb(payload: KBEntryCreate, ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    entry = KBEntry(**payload.model_dump()).model_dump()
    entry["tenant_id"] = tid
    await dbmod.kb.insert_one(dict(entry))
    return entry


@router.delete("/{entry_id}")
async def delete_kb(entry_id: str, ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    res = await dbmod.kb.delete_one({"tenant_id": tid, "id": entry_id})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}
