from datetime import datetime, timezone
from core import db as dbmod


def _now():
    return datetime.now(timezone.utc).isoformat()


async def log_action(tenant_id: str, actor_id: str | None, action: str, target: str = "", meta: dict | None = None):
    await dbmod.audit_logs.insert_one({
        "tenant_id": tenant_id, "actor_id": actor_id, "action": action,
        "target": target, "meta": meta or {}, "at": _now(),
    })


async def notify(tenant_id: str, kind: str, message: str, meta: dict | None = None, user_id: str | None = None):
    """Create an in-app notification. If user_id is None, broadcast to all tenant members."""
    targets = [user_id] if user_id else None
    if targets is None:
        members = await dbmod.members.find({"tenant_id": tenant_id}, {"_id": 0, "user_id": 1}).to_list(500)
        targets = [m["user_id"] for m in members]
    docs = [{
        "tenant_id": tenant_id, "user_id": uid, "kind": kind, "message": message,
        "meta": meta or {}, "read": False, "at": _now(),
    } for uid in targets]
    if docs:
        await dbmod.notifications.insert_many(docs)
