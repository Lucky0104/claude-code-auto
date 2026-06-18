from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from core.deps import get_current_tenant, require_role
from core.security import decrypt_token
from core import db as dbmod
from core import meta
from core.models import ApprovalAction

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_approvals(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    items = await dbmod.approvals.find({"tenant_id": tid, "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    # Enrich with comment data
    for a in items:
        c = await dbmod.comments.find_one({"tenant_id": tid, "comment_id": a["comment_id"]}, {"_id": 0})
        a["comment"] = c
    return items


@router.post("/{comment_id}/action")
async def act(comment_id: str, action: ApprovalAction, ctx=Depends(require_role("owner", "admin", "moderator"))):
    tid = ctx["tenant"]["id"]
    appr = await dbmod.approvals.find_one({"tenant_id": tid, "comment_id": comment_id, "status": "pending"})
    if not appr:
        raise HTTPException(404, "Approval not found")
    comment = await dbmod.comments.find_one({"tenant_id": tid, "comment_id": comment_id})
    if not comment:
        raise HTTPException(404, "Comment not found")
    page = await dbmod.pages.find_one({"tenant_id": tid, "page_id": comment["page_id"]})

    if action.action == "reject":
        await dbmod.approvals.update_one({"_id": appr["_id"]}, {"$set": {"status": "rejected", "decided_by": ctx["user"]["id"], "decided_at": _now()}})
        await dbmod.comments.update_one({"tenant_id": tid, "comment_id": comment_id}, {"$set": {"status": "rejected"}})
        return {"ok": True}

    reply_text = action.edited_reply if action.action == "edit" else appr["suggested_reply"]
    if not reply_text:
        raise HTTPException(400, "Empty reply")
    if not page:
        raise HTTPException(400, "Source page not connected")

    tok = decrypt_token(page["access_token_enc"])
    try:
        res = await meta.reply_to_comment(comment_id, reply_text, tok)
    except Exception as e:
        raise HTTPException(502, f"Meta error: {e}")
    await dbmod.replies.insert_one({
        "tenant_id": tid, "comment_id": comment_id, "reply_id": res.get("id"),
        "text": reply_text, "auto": False, "approved_by": ctx["user"]["id"],
        "posted_at": _now(),
    })
    await dbmod.approvals.update_one({"_id": appr["_id"]}, {"$set": {"status": "approved", "decided_by": ctx["user"]["id"], "decided_at": _now(), "final_reply": reply_text}})
    await dbmod.comments.update_one({"tenant_id": tid, "comment_id": comment_id}, {"$set": {"status": "replied"}})
    from core.events import log_action
    await log_action(tid, ctx["user"]["id"], f"approval.{action.action}", comment_id, {"text": reply_text[:200]})
    return {"ok": True}
