from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from core.deps import get_current_tenant, require_role
from core.security import decrypt_token, encrypt_token
from core import db as dbmod
from core import meta

router = APIRouter(prefix="/pages", tags=["pages"])


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("/discover")
async def discover_pages(ctx=Depends(require_role("owner", "admin"))):
    """Fetch user's FB pages from Meta (live) so they can choose which to connect."""
    user = ctx["user"]
    if not user.get("fb_access_token"):
        raise HTTPException(400, "No Facebook token; please log in with Facebook")
    tok = decrypt_token(user["fb_access_token"])
    try:
        pages = await meta.get_user_pages(tok)
    except Exception as e:
        raise HTTPException(502, f"Meta error: {e}")
    # Enrich with IG account
    out = []
    for p in pages:
        ig = None
        try:
            ig = await meta.get_ig_account_for_page(p["id"], p["access_token"])
        except Exception:
            ig = None
        out.append({
            "page_id": p["id"], "name": p["name"], "category": p.get("category", ""),
            "fan_count": p.get("fan_count", 0), "picture": (p.get("picture") or {}).get("data", {}).get("url", ""),
            "tasks": p.get("tasks", []),
            "instagram": ig,
        })
    return out


@router.post("/connect/{page_id}")
async def connect_page(page_id: str, ctx=Depends(require_role("owner", "admin"))):
    user = ctx["user"]
    tid = ctx["tenant"]["id"]
    tok = decrypt_token(user["fb_access_token"])
    fb_pages = await meta.get_user_pages(tok)
    target = next((p for p in fb_pages if p["id"] == page_id), None)
    if not target:
        raise HTTPException(404, "Page not found in your account")
    page_token = target["access_token"]
    doc = {
        "tenant_id": tid,
        "page_id": page_id,
        "name": target["name"],
        "category": target.get("category", ""),
        "fan_count": target.get("fan_count", 0),
        "picture": (target.get("picture") or {}).get("data", {}).get("url", ""),
        "access_token_enc": encrypt_token(page_token),
        "connected_at": _now(),
        "active": True,
    }
    await dbmod.pages.update_one({"tenant_id": tid, "page_id": page_id}, {"$set": doc}, upsert=True)
    from core.events import log_action
    await log_action(tid, ctx["user"]["id"], "page.connected", page_id, {"name": target["name"]})
    # Try to subscribe webhook (best-effort)
    try:
        await meta.subscribe_page(page_id, page_token)
    except Exception:
        pass
    # Also auto-link IG account if exists
    try:
        ig = await meta.get_ig_account_for_page(page_id, page_token)
        if ig:
            ig_doc = {
                "tenant_id": tid, "page_id": page_id, "ig_id": ig["id"],
                "username": ig.get("username", ""), "name": ig.get("name", ""),
                "picture": ig.get("profile_picture_url", ""),
                "followers_count": ig.get("followers_count", 0),
                "media_count": ig.get("media_count", 0),
                "access_token_enc": encrypt_token(page_token),
                "connected_at": _now(), "active": True,
            }
            await dbmod.ig_accounts.update_one({"tenant_id": tid, "ig_id": ig["id"]}, {"$set": ig_doc}, upsert=True)
    except Exception:
        pass
    return {"ok": True, "page_id": page_id}


@router.get("")
async def list_pages(ctx=Depends(get_current_tenant)):
    tid = ctx["tenant"]["id"]
    items = await dbmod.pages.find({"tenant_id": tid}, {"_id": 0, "access_token_enc": 0}).to_list(200)
    return items


@router.delete("/{page_id}")
async def disconnect_page(page_id: str, ctx=Depends(require_role("owner", "admin"))):
    tid = ctx["tenant"]["id"]
    await dbmod.pages.delete_one({"tenant_id": tid, "page_id": page_id})
    await dbmod.ig_accounts.delete_many({"tenant_id": tid, "page_id": page_id})
    return {"ok": True}


@router.post("/{page_id}/sync")
async def sync_page(page_id: str, ctx=Depends(require_role("owner", "admin"))):
    """Fetch posts + comments from Meta and run AI pipeline."""
    from core.ai import classify_comment, generate_reply, should_auto_reply
    tid = ctx["tenant"]["id"]
    page = await dbmod.pages.find_one({"tenant_id": tid, "page_id": page_id})
    if not page:
        raise HTTPException(404, "Page not connected")
    tok = decrypt_token(page["access_token_enc"])
    posts: list[dict] = []
    try:
        posts = await meta.get_page_posts(page_id, tok, limit=10)
    except Exception as e:
        raise HTTPException(502, f"Meta error: {e}")

    new_comments = 0
    tenant = ctx["tenant"]
    kb_entries = await dbmod.kb.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    kb_ctx = "\n".join([f"- [{e['kind']}] {e['title']}: {e['content']}" for e in kb_entries])
    brand = {"name": tenant.get("business_name", ""), "tone": tenant.get("brand_tone", ""), "industry": tenant.get("industry", "")}

    for p in posts:
        await dbmod.posts.update_one(
            {"tenant_id": tid, "post_id": p["id"]},
            {"$set": {
                "tenant_id": tid, "post_id": p["id"], "page_id": page_id,
                "message": p.get("message", ""), "created_time": p.get("created_time", ""),
                "permalink_url": p.get("permalink_url", ""), "full_picture": p.get("full_picture", ""),
            }}, upsert=True,
        )
        try:
            comments = await meta.get_post_comments(p["id"], tok, limit=25)
        except Exception:
            continue
        for c in comments:
            exists = await dbmod.comments.find_one({"tenant_id": tid, "comment_id": c["id"]})
            if exists:
                continue
            cls = await classify_comment(c.get("message", ""), p.get("message", ""))
            doc = {
                "tenant_id": tid, "comment_id": c["id"], "post_id": p["id"], "page_id": page_id,
                "platform": "facebook",
                "from_name": (c.get("from") or {}).get("name", "Unknown"),
                "from_id": (c.get("from") or {}).get("id", ""),
                "message": c.get("message", ""),
                "created_time": c.get("created_time", ""),
                "like_count": c.get("like_count", 0),
                "classification": cls,
                "category": cls.get("category"),
                "sentiment": cls.get("sentiment"),
                "confidence": cls.get("confidence"),
                "status": "pending",
                "created_at": _now(),
            }
            await dbmod.comments.insert_one(doc)
            new_comments += 1

            # Lead detection
            if cls.get("lead_score", 0) >= 60 or cls.get("category") == "lead_intent":
                await dbmod.leads.insert_one({
                    "tenant_id": tid, "comment_id": c["id"], "from_name": doc["from_name"],
                    "from_id": doc["from_id"], "page_id": page_id,
                    "message": doc["message"], "score": cls.get("lead_score", 0),
                    "category": cls.get("category"),
                    "status": "new", "created_at": _now(),
                })

            # AI reply or approval
            try:
                reply_text = await generate_reply(c.get("message", ""), cls, kb_ctx, brand)
            except Exception:
                reply_text = ""
            if should_auto_reply(cls) and reply_text and tenant.get("auto_reply_enabled", True):
                try:
                    res = await meta.reply_to_comment(c["id"], reply_text, tok)
                    await dbmod.replies.insert_one({
                        "tenant_id": tid, "comment_id": c["id"], "reply_id": res.get("id"),
                        "text": reply_text, "auto": True, "approved_by": None,
                        "posted_at": _now(),
                    })
                    await dbmod.comments.update_one({"tenant_id": tid, "comment_id": c["id"]}, {"$set": {"status": "replied"}})
                except Exception as e:
                    await dbmod.approvals.insert_one({
                        "tenant_id": tid, "comment_id": c["id"], "suggested_reply": reply_text,
                        "reason": f"auto-reply failed: {e}", "status": "pending", "created_at": _now(),
                    })
            else:
                await dbmod.approvals.insert_one({
                    "tenant_id": tid, "comment_id": c["id"], "suggested_reply": reply_text,
                    "reason": "requires human approval", "status": "pending", "created_at": _now(),
                })
                await dbmod.comments.update_one({"tenant_id": tid, "comment_id": c["id"]}, {"$set": {"status": "pending_approval"}})

    return {"ok": True, "new_comments": new_comments, "posts_synced": len(posts)}
