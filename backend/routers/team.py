import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from core.deps import get_current_tenant, require_role, get_current_user
from core import db as dbmod
from core.models import InviteCreate

router = APIRouter(prefix="/team", tags=["team"])


def _now(): return datetime.now(timezone.utc).isoformat()


@router.get("/members")
async def list_members(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    items = await dbmod.members.find({"tenant_id": tid}, {"_id": 0}).to_list(200)
    for m in items:
        u = await dbmod.users.find_one({"id": m["user_id"]}, {"_id": 0, "fb_access_token": 0})
        m["user"] = u
    return items


@router.get("/invites")
async def list_invites(ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    return await dbmod.invites.find({"tenant_id": tid, "status": "pending"}, {"_id": 0}).to_list(200)


@router.post("/invite")
async def invite(payload: InviteCreate, ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    if payload.role not in ("owner", "admin", "moderator", "viewer"):
        raise HTTPException(400, "Invalid role")
    token = secrets.token_urlsafe(24)
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": tid, "email": payload.email,
        "role": payload.role, "token": token, "status": "pending",
        "invited_by": ctx["user"]["id"], "created_at": _now(),
    }
    await dbmod.invites.insert_one(dict(doc))
    return doc


@router.post("/accept/{token}")
async def accept(token: str, user=Depends(get_current_user)):
    inv = await dbmod.invites.find_one({"token": token, "status": "pending"})
    if not inv:
        raise HTTPException(404, "Invite not found or expired")
    existing = await dbmod.members.find_one({"user_id": user["id"], "tenant_id": inv["tenant_id"]})
    if existing:
        await dbmod.invites.update_one({"_id": inv["_id"]}, {"$set": {"status": "accepted"}})
        return {"ok": True, "tenant_id": inv["tenant_id"]}
    await dbmod.members.insert_one({
        "user_id": user["id"], "tenant_id": inv["tenant_id"], "role": inv["role"], "created_at": _now()
    })
    await dbmod.invites.update_one({"_id": inv["_id"]}, {"$set": {"status": "accepted"}})
    return {"ok": True, "tenant_id": inv["tenant_id"]}


@router.delete("/members/{user_id}")
async def remove_member(user_id: str, ctx=Depends(require_role("owner"))):
    tid = ctx["tenant"]["id"]
    if user_id == ctx["tenant"]["owner_user_id"]:
        raise HTTPException(400, "Cannot remove owner")
    await dbmod.members.delete_one({"tenant_id": tid, "user_id": user_id})
    return {"ok": True}
