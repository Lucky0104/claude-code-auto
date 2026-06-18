from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from core.deps import get_current_tenant, require_role
from core import db as dbmod
from core.models import OnboardingPayload, TenantUpdate

router = APIRouter(prefix="/tenant", tags=["tenant"])


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.post("/onboard")
async def onboard(payload: OnboardingPayload, ctx=Depends(require_role("owner"))):
    tid = ctx["tenant"]["id"]
    await dbmod.tenants.update_one({"id": tid}, {"$set": {**payload.model_dump(), "onboarded": True, "updated_at": _now()}})
    t = await dbmod.tenants.find_one({"id": tid}, {"_id": 0})
    return t


@router.get("")
async def get_tenant(ctx=Depends(get_current_tenant)):
    return ctx["tenant"]


@router.patch("")
async def update_tenant(payload: TenantUpdate, ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if upd:
        upd["updated_at"] = _now()
        await dbmod.tenants.update_one({"id": tid}, {"$set": upd})
    return await dbmod.tenants.find_one({"id": tid}, {"_id": 0})
