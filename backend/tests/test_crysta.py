"""Structural tests for the Crysta IVF auto-comment bot feature.

Run on a single asyncio event loop so Motor and httpx share the same loop.

Run: cd /app/backend && python -m pytest tests/test_crysta.py -xvs
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import httpx
from httpx import ASGITransport
from pymongo.errors import DuplicateKeyError

_REAL_ASYNC_CLIENT = httpx.AsyncClient  # captured before any test monkeypatches

sys.path.insert(0, "/app/backend")

from server import app  # noqa: E402
from core import db as dbmod  # noqa: E402
from core import meta as metamod  # noqa: E402
from core.security import create_jwt, encrypt_token  # noqa: E402
from routers import campaigns as campaigns_mod  # noqa: E402
from routers import webhooks as webhooks_mod  # noqa: E402
from routers import auth as auth_mod  # noqa: E402


# ---------------------------------------------------------------------------
TENANT_ID = f"test-tenant-{uuid.uuid4().hex[:8]}"
USER_ID = f"test-user-{uuid.uuid4().hex[:8]}"
CAMPAIGN_ID = f"23854{uuid.uuid4().hex[:10]}"
POST_ID = f"Cabc{uuid.uuid4().hex[:6]}"
CSRF = "csrf-" + uuid.uuid4().hex[:10]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def auth_headers() -> dict:
    token = create_jwt(USER_ID, TENANT_ID)
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": TENANT_ID,
        "X-CSRF-Token": CSRF,
    }


def cookies() -> dict:
    return {"dashai_csrf": CSRF}


async def _seed():
    await dbmod.ensure_indexes()
    # clean slate
    await dbmod.users.delete_many({"id": USER_ID})
    await dbmod.tenants.delete_many({"id": TENANT_ID})
    await dbmod.members.delete_many({"tenant_id": TENANT_ID})
    await dbmod.campaigns.delete_many({"tenant_id": TENANT_ID})
    await dbmod.monitored_posts.delete_many({"tenant_id": TENANT_ID})
    await dbmod.comment_logs.delete_many({"campaign_id": CAMPAIGN_ID})
    await dbmod.pages.delete_many({"tenant_id": TENANT_ID})

    await dbmod.users.insert_one(
        {"id": USER_ID, "name": "Test", "email": "t@example.com", "created_at": _iso()}
    )
    await dbmod.tenants.insert_one(
        {
            "id": TENANT_ID,
            "business_name": "Test workspace",
            "owner_user_id": USER_ID,
            "ad_account_id": "999999999999",
            "created_at": _iso(),
        }
    )
    await dbmod.members.insert_one(
        {"user_id": USER_ID, "tenant_id": TENANT_ID, "role": "owner", "created_at": _iso()}
    )
    await dbmod.pages.insert_one(
        {
            "tenant_id": TENANT_ID,
            "page_id": "page-1",
            "name": "Test page",
            "is_active": True,
            "access_token_enc": encrypt_token("EAA-fake-page-token"),
            "connected_at": _iso(),
        }
    )
    # The CSRF middleware sets cookie on first response if absent; we pre-load
    # both cookie + matching header so middleware accepts the value.


def _run(coro):
    """Run coroutine on the single event loop used by all tests."""
    return _LOOP.run_until_complete(coro)


_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)
_run(_seed())


# ---------------------------------------------------------------------------
# Async HTTP helper bound to the same event loop as Motor
# ---------------------------------------------------------------------------
def request(method: str, url: str, **kw):
    async def _call():
        transport = ASGITransport(app=app)
        async with _REAL_ASYNC_CLIENT(
            transport=transport, base_url="http://testserver"
        ) as ac:
            ac.cookies.set("dashai_csrf", CSRF)
            kw.setdefault("headers", {}).setdefault("X-CSRF-Token", CSRF)
            return await ac.request(method, url, **kw)

    return _run(_call())


# ---------------------------------------------------------------------------
# 1) Auth-protected routes return 401/403 without token
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/campaigns"),
        ("GET", "/api/campaigns/sync"),
        ("GET", "/api/campaigns/comment-logs"),
        ("GET", f"/api/campaigns/{CAMPAIGN_ID}"),
        ("PATCH", f"/api/campaigns/{CAMPAIGN_ID}/center-config"),
        ("GET", f"/api/campaigns/{CAMPAIGN_ID}/posts"),
        ("POST", f"/api/campaigns/{CAMPAIGN_ID}/posts/{POST_ID}/monitor"),
        ("DELETE", f"/api/campaigns/{CAMPAIGN_ID}/posts/{POST_ID}/monitor"),
    ],
)
def test_routes_require_auth(method, path):
    r = request(method, path, json={} if method == "PATCH" else None)
    assert r.status_code in (401, 403), f"{method} {path} -> {r.status_code}"


# ---------------------------------------------------------------------------
# 2) Pydantic CenterConfig validation
# ---------------------------------------------------------------------------
def test_center_config_rejects_missing_required():
    _run(
        dbmod.campaigns.update_one(
            {"_id": CAMPAIGN_ID},
            {
                "$set": {
                    "tenant_id": TENANT_ID,
                    "name": "C1",
                    "status": "ACTIVE",
                    "is_configured": False,
                }
            },
            upsert=True,
        )
    )
    r = request(
        "PATCH",
        f"/api/campaigns/{CAMPAIGN_ID}/center-config",
        headers=auth_headers(),
        json={"center_name": "X"},  # missing doctor/address/phone
    )
    assert r.status_code == 422, r.text


def test_center_config_saves_and_marks_configured():
    r = request(
        "PATCH",
        f"/api/campaigns/{CAMPAIGN_ID}/center-config",
        headers=auth_headers(),
        json={
            "center_name": "Bengaluru",
            "doctor_name": "Dr. A",
            "address": "Main St",
            "phone": "+91 99999",
            "whatsapp": "",
            "reply_template": None,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_configured"] is True
    assert body["doctor_name"] == "Dr. A"


# ---------------------------------------------------------------------------
# 3) MongoDB indexes present
# ---------------------------------------------------------------------------
def test_indexes_present():
    cl = _run(dbmod.comment_logs.index_information())
    assert any(
        v.get("unique") and v["key"] == [("comment_id", 1)] for v in cl.values()
    ), f"comment_logs missing unique comment_id idx: {cl}"

    mp = _run(dbmod.monitored_posts.index_information())
    assert any(
        v.get("unique") and v["key"] == [("instagram_post_id", 1), ("tenant_id", 1)]
        for v in mp.values()
    ), f"monitored_posts missing unique compound: {mp}"

    camp = _run(dbmod.campaigns.index_information())
    assert any(
        v["key"] == [("tenant_id", 1), ("meta_synced_at", -1)] for v in camp.values()
    ), f"campaigns missing compound idx: {camp}"


# ---------------------------------------------------------------------------
# 4) Dedup blocks a second insert of the same comment_id
# ---------------------------------------------------------------------------
def test_comment_logs_unique_dedup():
    cid = f"dedup-{uuid.uuid4().hex}"
    doc = {
        "comment_id": cid,
        "campaign_id": CAMPAIGN_ID,
        "instagram_post_id": POST_ID,
        "tenant_id": TENANT_ID,
        "status": "replied",
        "replied_at": _iso(),
    }
    _run(dbmod.comment_logs.insert_one(dict(doc)))
    with pytest.raises(DuplicateKeyError):
        _run(dbmod.comment_logs.insert_one(dict(doc)))


# ---------------------------------------------------------------------------
# 5) Monitor toggle gates on is_configured
# ---------------------------------------------------------------------------
def test_monitor_blocked_when_not_configured():
    cid = f"unc-{uuid.uuid4().hex[:8]}"
    _run(
        dbmod.campaigns.insert_one(
            {
                "_id": cid,
                "tenant_id": TENANT_ID,
                "name": "Unconfigured",
                "status": "ACTIVE",
                "is_configured": False,
                "created_at": _iso(),
            }
        )
    )
    r = request(
        "POST",
        f"/api/campaigns/{cid}/posts/{POST_ID}/monitor",
        headers=auth_headers(),
    )
    assert r.status_code == 400, r.text
    assert "configure" in r.text.lower()


def test_monitor_succeeds_when_configured():
    r = request(
        "POST",
        f"/api/campaigns/{CAMPAIGN_ID}/posts/{POST_ID}/monitor",
        headers=auth_headers(),
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_monitoring"] is True

    r2 = request(
        "DELETE",
        f"/api/campaigns/{CAMPAIGN_ID}/posts/{POST_ID}/monitor",
        headers=auth_headers(),
    )
    assert r2.status_code == 200
    assert r2.json()["is_monitoring"] is False


# ---------------------------------------------------------------------------
# 6) Comment-logs feed returns valid shape
# ---------------------------------------------------------------------------
def test_comment_logs_feed():
    r = request("GET", "/api/campaigns/comment-logs", headers=auth_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "count" in body
    assert isinstance(body["items"], list)


# ---------------------------------------------------------------------------
# 7) Webhook background task — runs through full path without crashing
# ---------------------------------------------------------------------------
class _FakeResp:
    def __init__(self, code=200, payload=None):
        self.status_code = code
        self._payload = payload or {"id": "reply-id"}

    def json(self):
        return self._payload

    @property
    def text(self):
        return str(self._payload)


class _FakeClient:
    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, data=None, **kw):
        return _FakeResp(200, {"id": "reply-123"})

    async def get(self, url, params=None, **kw):
        return _FakeResp(200, {"data": []})


def test_webhook_process_one_comment_replies_and_dedups(monkeypatch):
    _run(
        dbmod.monitored_posts.update_one(
            {"instagram_post_id": POST_ID, "tenant_id": TENANT_ID},
            {
                "$set": {
                    "campaign_id": CAMPAIGN_ID,
                    "instagram_post_id": POST_ID,
                    "tenant_id": TENANT_ID,
                    "is_active": True,
                    "instagram_permalink": f"https://instagram.com/p/{POST_ID}/",
                    "activated_at": _iso(),
                    "activated_by": USER_ID,
                }
            },
            upsert=True,
        )
    )

    monkeypatch.setattr(webhooks_mod.httpx, "AsyncClient", _FakeClient)

    cid = f"wh-{uuid.uuid4().hex}"
    value = {
        "comment_id": cid,
        "media_id": POST_ID,
        "from": {"id": "user-123", "name": "Tester"},
        "text": "Tell me more about IVF",
    }
    _run(webhooks_mod._process_one_comment(cid, POST_ID, value))

    log = _run(dbmod.comment_logs.find_one({"comment_id": cid}))
    assert log is not None, "comment_log not inserted"
    assert log["status"] == "replied"
    assert "Dr. A" in (log.get("reply_sent") or "")

    # Second time: deduped
    _run(webhooks_mod._process_one_comment(cid, POST_ID, value))
    cnt = _run(dbmod.comment_logs.count_documents({"comment_id": cid}))
    assert cnt == 1


def test_webhook_skips_unmonitored_post(monkeypatch):
    monkeypatch.setattr(webhooks_mod.httpx, "AsyncClient", _FakeClient)
    cid = f"skip-{uuid.uuid4().hex}"
    value = {"comment_id": cid, "media_id": "not-monitored-x", "from": {"id": "u"}}
    _run(webhooks_mod._process_one_comment(cid, "not-monitored-x", value))
    log = _run(dbmod.comment_logs.find_one({"comment_id": cid}))
    assert log is None


def test_webhook_records_failure_on_meta_error(monkeypatch):
    class _FailingClient(_FakeClient):
        async def post(self, *a, **kw):
            return _FakeResp(400, {"error": {"message": "Permissions error"}})

    monkeypatch.setattr(webhooks_mod.httpx, "AsyncClient", _FailingClient)
    cid = f"fail-{uuid.uuid4().hex}"
    value = {"comment_id": cid, "media_id": POST_ID, "from": {"id": "u"}, "text": "..."}
    _run(webhooks_mod._process_one_comment(cid, POST_ID, value))
    log = _run(dbmod.comment_logs.find_one({"comment_id": cid}))
    assert log and log["status"] == "failed"
    assert "Permissions" in (log.get("error") or "")


# ---------------------------------------------------------------------------
# 8) Sync requires ad_account_id; clear error otherwise
# ---------------------------------------------------------------------------
def test_sync_requires_ad_account_id():
    tid2 = f"no-ad-{uuid.uuid4().hex[:8]}"
    uid2 = f"no-ad-u-{uuid.uuid4().hex[:8]}"
    _run(dbmod.users.insert_one({"id": uid2, "name": "x", "email": "", "created_at": _iso()}))
    _run(
        dbmod.tenants.insert_one(
            {"id": tid2, "business_name": "x", "owner_user_id": uid2, "created_at": _iso()}
        )
    )
    _run(
        dbmod.members.insert_one(
            {"user_id": uid2, "tenant_id": tid2, "role": "owner", "created_at": _iso()}
        )
    )
    tok = create_jwt(uid2, tid2)
    r = request(
        "GET",
        "/api/campaigns/sync",
        headers={
            "Authorization": f"Bearer {tok}",
            "X-Tenant-Id": tid2,
            "X-CSRF-Token": CSRF,
        },
    )
    assert r.status_code == 400, r.text
    assert "reconnect" in r.text.lower() or "ad account" in r.text.lower()


# ---------------------------------------------------------------------------
# 9) OAuth scopes
# ---------------------------------------------------------------------------
def test_oauth_scopes_include_required():
    required = {
        "ads_read",
        "pages_read_engagement",
        "pages_manage_engagement",
        "instagram_manage_comments",
    }
    have = set(metamod.DEFAULT_SCOPES)
    missing = required - have
    assert not missing, f"OAuth scopes missing: {missing}"


def test_login_url_emits_required_scopes():
    url = metamod.login_dialog_url("teststate")
    for s in [
        "ads_read",
        "pages_read_engagement",
        "pages_manage_engagement",
        "instagram_manage_comments",
    ]:
        assert s in url, f"scope {s} not in dialog url"


# ---------------------------------------------------------------------------
# 10) Sync path: stub Meta + verify filtering arg + upsert
# ---------------------------------------------------------------------------
def test_sync_upserts_campaigns(monkeypatch):
    captured = {}

    class _SyncClient(_FakeClient):
        async def get(self, url, params=None, **kw):
            captured["url"] = url
            captured["params"] = params or {}
            return _FakeResp(
                200,
                {
                    "data": [
                        {
                            "id": "synced-camp-1",
                            "name": "City A",
                            "status": "ACTIVE",
                            "objective": "LINK_CLICKS",
                            "daily_budget": "50000",
                        },
                        {
                            "id": "synced-camp-2",
                            "name": "City B",
                            "status": "PAUSED",
                            "objective": "MESSAGES",
                            "lifetime_budget": "200000",
                        },
                    ]
                },
            )

    monkeypatch.setattr(campaigns_mod.httpx, "AsyncClient", _SyncClient)

    r = request("GET", "/api/campaigns/sync", headers=auth_headers())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 2
    assert "filtering" in captured["params"]
    assert "effective_status" in captured["params"]["filtering"]
    assert "ACTIVE" in captured["params"]["filtering"]
    assert "act_999999999999/campaigns" in captured["url"]

    d1 = _run(dbmod.campaigns.find_one({"_id": "synced-camp-1"}))
    assert d1 and d1["is_configured"] is False
    assert d1["tenant_id"] == TENANT_ID

    _run(dbmod.campaigns.delete_many({"_id": {"$in": ["synced-camp-1", "synced-camp-2"]}}))


# ---------------------------------------------------------------------------
# 11) Auth callback stores ad_account_id (E2E with stubbed Meta)
# ---------------------------------------------------------------------------
def test_get_user_adaccounts_helper_exists():
    fn = getattr(metamod, "get_user_adaccounts", None)
    assert fn is not None and asyncio.iscoroutinefunction(fn)


def test_auth_callback_stores_ad_account_id(monkeypatch):
    fb_id = f"fb-{uuid.uuid4().hex[:8]}"

    async def fake_exchange(_code):
        return {"access_token": "short-tok"}

    async def fake_long(_t):
        return {"access_token": "long-tok"}

    async def fake_me(_t):
        return {"id": fb_id, "name": "OAuth Tester", "email": "o@x.com", "picture": {}}

    async def fake_adaccounts(_t):
        return [
            {
                "id": "act_555000111",
                "account_id": "555000111",
                "name": "Live",
                "account_status": 1,
            },
            {
                "id": "act_999",
                "account_id": "999",
                "name": "Disabled",
                "account_status": 2,
            },
        ]

    monkeypatch.setattr(auth_mod.meta, "exchange_code_for_token", fake_exchange)
    monkeypatch.setattr(auth_mod.meta, "get_long_lived_user_token", fake_long)
    monkeypatch.setattr(auth_mod.meta, "get_me", fake_me)
    monkeypatch.setattr(auth_mod.meta, "get_user_adaccounts", fake_adaccounts)

    state = "teststate-" + uuid.uuid4().hex[:6]
    _run(
        dbmod.db.oauth_states.insert_one(
            {
                "state": state,
                "created": _iso(),
                "expires_at": datetime.now(timezone.utc).replace(year=2099),
            }
        )
    )

    r = request(
        "GET",
        f"/api/auth/facebook/callback?code=abc&state={state}",
    )
    assert r.status_code in (302, 307), r.text

    user = _run(dbmod.users.find_one({"fb_user_id": fb_id}))
    assert user is not None
    member = _run(dbmod.members.find_one({"user_id": user["id"]}))
    assert member is not None
    tenant = _run(dbmod.tenants.find_one({"id": member["tenant_id"]}))
    assert tenant["ad_account_id"] == "555000111", tenant

    _run(dbmod.users.delete_one({"id": user["id"]}))
    _run(dbmod.tenants.delete_one({"id": tenant["id"]}))
    _run(dbmod.members.delete_one({"user_id": user["id"]}))
