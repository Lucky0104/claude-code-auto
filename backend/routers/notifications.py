from fastapi import APIRouter, Depends
from core.deps import get_current_tenant, get_current_user
from core import db as dbmod

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]; uid = ctx["user"]["id"]
    items = await dbmod.notifications.find({"tenant_id": tid, "user_id": uid}, {"_id": 0}).sort("at", -1).to_list(50)
    unread = await dbmod.notifications.count_documents({"tenant_id": tid, "user_id": uid, "read": False})
    return {"items": items, "unread": unread}


@router.post("/read-all")
async def read_all(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]; uid = ctx["user"]["id"]
    await dbmod.notifications.update_many({"tenant_id": tid, "user_id": uid, "read": False}, {"$set": {"read": True}})
    return {"ok": True}
