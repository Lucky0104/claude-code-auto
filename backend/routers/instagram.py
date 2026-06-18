from fastapi import APIRouter, Depends
from core.deps import get_current_tenant
from core import db as dbmod

router = APIRouter(prefix="/instagram", tags=["instagram"])


@router.get("")
async def list_ig(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    return await dbmod.ig_accounts.find({"tenant_id": tid}, {"_id": 0, "access_token_enc": 0}).to_list(200)
