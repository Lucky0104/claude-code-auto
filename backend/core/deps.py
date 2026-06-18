from fastapi import Depends, HTTPException, Header, Cookie, status
from typing import Optional
from core.security import decode_jwt
from core import db as dbmod


async def get_current_user(
    authorization: Optional[str] = Header(None),
    dashai_token: Optional[str] = Cookie(None),
):
    token = None
    if dashai_token:
        token = dashai_token
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    try:
        payload = decode_jwt(token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = await dbmod.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    user["_tid"] = payload.get("tid")
    return user


async def get_current_tenant(user=Depends(get_current_user), x_tenant_id: Optional[str] = Header(None)):
    tid = x_tenant_id or user.get("_tid")
    if not tid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tenant not selected")
    member = await dbmod.members.find_one({"user_id": user["id"], "tenant_id": tid}, {"_id": 0})
    if not member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of tenant")
    tenant = await dbmod.tenants.find_one({"id": tid}, {"_id": 0})
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    return {"tenant": tenant, "member": member, "user": user}


def require_role(*roles: str):
    async def _checker(ctx=Depends(get_current_tenant)):
        if ctx["member"]["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role: {roles}")
        return ctx
    return _checker
