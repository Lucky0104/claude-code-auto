"""DashAI backend API tests - tenant/auth/kb/team/leads/comments/approvals/analytics/webhooks."""
import os
import sys
import json
import hmac
import hashlib
import uuid
import asyncio
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

import pytest
import requests

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from core import db as dbmod  # noqa
from core.security import create_jwt, encrypt_token  # noqa

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")

FB_APP_SECRET = os.environ["FB_APP_SECRET"]
VERIFY_TOKEN = os.environ["FB_WEBHOOK_VERIFY_TOKEN"]

NOW = datetime.now(timezone.utc).isoformat()


def _seed_user_tenant(role="owner", business="TEST_Co"):
    uid = "TEST_u_" + uuid.uuid4().hex[:8]
    tid = "TEST_t_" + uuid.uuid4().hex[:8]

    async def _ins():
        await dbmod.users.insert_one({
            "id": uid, "fb_user_id": uid, "name": "T", "email": f"{uid}@t.com",
            "picture": "", "fb_access_token": encrypt_token("fake_fb_token"),
            "created_at": NOW,
        })
        await dbmod.tenants.insert_one({
            "id": tid, "business_name": business, "owner_user_id": uid,
            "onboarded": False, "auto_reply_enabled": True, "industry": "E-com",
            "website": "", "description": "", "brand_tone": "friendly",
            "reply_style": "concise", "support_email": "", "support_phone": "",
            "timezone": "UTC", "created_at": NOW,
        })
        await dbmod.members.insert_one({
            "user_id": uid, "tenant_id": tid, "role": role, "created_at": NOW,
        })
    asyncio.get_event_loop().run_until_complete(_ins())
    return uid, tid, create_jwt(uid, tid)


@pytest.fixture(scope="session")
def seeded_owner():
    uid, tid, jwt = _seed_user_tenant("owner")
    yield {"uid": uid, "tid": tid, "jwt": jwt}


@pytest.fixture(scope="session")
def seeded_viewer():
    uid, tid, jwt = _seed_user_tenant("viewer", "TEST_Viewer_Co")
    yield {"uid": uid, "tid": tid, "jwt": jwt}


@pytest.fixture(scope="session")
def seeded_second_user():
    uid, tid, jwt = _seed_user_tenant("owner", "TEST_Second_Co")
    yield {"uid": uid, "tid": tid, "jwt": jwt}


def H(jwt, tid=None):
    h = {"Authorization": f"Bearer {jwt}"}
    if tid:
        h["X-Tenant-Id"] = tid
    return h


# ====================================================================
# CSRF double-submit cookie auto-injection (iteration 3)
# ====================================================================
@pytest.fixture(autouse=True, scope="session")
def _csrf_autoinject():
    """Fetch dashai_csrf cookie once, monkey-patch requests.{post,patch,delete}
    to (a) include the cookie, (b) echo it as X-CSRF-Token header,
    EXCEPT for /api/webhooks/meta which is CSRF-exempt."""
    r0 = requests.get(f"{BASE_URL}/api/health", timeout=10)
    csrf = r0.cookies.get("dashai_csrf")
    if not csrf:
        # cookie is set on the response of a request that lacked it; one more GET should expose it
        r1 = requests.get(f"{BASE_URL}/api/health", timeout=10)
        csrf = r1.cookies.get("dashai_csrf") or r0.cookies.get("dashai_csrf")
    assert csrf, "Backend did not set dashai_csrf cookie on GET /api/health"

    _orig = {"post": requests.post, "patch": requests.patch, "delete": requests.delete}

    def _wrap(method_name):
        orig = _orig[method_name]
        def _fn(url, **kw):
            if "/api/webhooks/meta" not in url:
                headers = dict(kw.get("headers") or {})
                headers.setdefault("X-CSRF-Token", csrf)
                kw["headers"] = headers
                cookies = kw.get("cookies")
                if cookies is None:
                    kw["cookies"] = {"dashai_csrf": csrf}
                elif isinstance(cookies, dict):
                    cookies.setdefault("dashai_csrf", csrf)
                    kw["cookies"] = cookies
            return orig(url, **kw)
        return _fn

    requests.post = _wrap("post")
    requests.patch = _wrap("patch")
    requests.delete = _wrap("delete")
    yield csrf
    requests.post = _orig["post"]
    requests.patch = _orig["patch"]
    requests.delete = _orig["delete"]


@pytest.fixture(scope="session")
def csrf_token(_csrf_autoinject):
    return _csrf_autoinject


# ---------- Public / health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json() == {"ok": True}


# ---------- Facebook OAuth URL builder ----------
def test_fb_login_url():
    r = requests.get(f"{BASE_URL}/api/auth/facebook/login", timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert "url" in j and "state" in j and j["state"]
    parsed = urlparse(j["url"])
    assert "facebook.com" in parsed.netloc
    q = parse_qs(parsed.query)
    scope = q.get("scope", [""])[0]
    for s in ("pages_show_list", "pages_manage_engagement", "instagram_basic",
              "instagram_manage_comments", "business_management"):
        assert s in scope, f"missing scope {s}"
    assert q.get("state", [""])[0] == j["state"]


# ---------- Webhooks ----------
def test_webhook_verify_ok():
    r = requests.get(f"{BASE_URL}/api/webhooks/meta",
                     params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "challenge_xyz"},
                     timeout=10)
    assert r.status_code == 200
    assert r.text == "challenge_xyz"


def test_webhook_verify_wrong_token():
    r = requests.get(f"{BASE_URL}/api/webhooks/meta",
                     params={"hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "x"},
                     timeout=10)
    assert r.status_code == 403


def test_webhook_post_missing_signature():
    r = requests.post(f"{BASE_URL}/api/webhooks/meta", data=b"{}", headers={"Content-Type": "application/json"}, timeout=10)
    assert r.status_code == 401


def test_webhook_post_valid_signature():
    body = json.dumps({"object": "page", "entry": []}).encode()
    sig = "sha256=" + hmac.new(FB_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    r = requests.post(f"{BASE_URL}/api/webhooks/meta", data=body,
                      headers={"Content-Type": "application/json", "x-hub-signature-256": sig}, timeout=10)
    assert r.status_code == 200


# ---------- Auth on protected endpoints ----------
@pytest.mark.parametrize("path", [
    "/api/tenant", "/api/pages", "/api/comments", "/api/approvals",
    "/api/leads", "/api/kb", "/api/team/members", "/api/analytics/overview",
])
def test_protected_endpoints_401_without_jwt(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=10)
    assert r.status_code == 401, f"{path} -> {r.status_code}"


# ---------- /me ----------
def test_me_returns_user_and_tenants(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(seeded_owner["jwt"]), timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert j["user"]["id"] == seeded_owner["uid"]
    assert any(t["id"] == seeded_owner["tid"] and t["role"] == "owner" for t in j["tenants"])


# ---------- Tenant ----------
def test_get_and_patch_tenant(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/tenant", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert r.json()["id"] == seeded_owner["tid"]
    new_name = "TEST_Renamed_" + uuid.uuid4().hex[:4]
    r2 = requests.patch(f"{BASE_URL}/api/tenant", headers={**H(seeded_owner["jwt"], seeded_owner["tid"]), "Content-Type": "application/json"},
                        data=json.dumps({"business_name": new_name}), timeout=10)
    assert r2.status_code == 200
    assert r2.json()["business_name"] == new_name
    r3 = requests.get(f"{BASE_URL}/api/tenant", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r3.json()["business_name"] == new_name


def test_tenant_onboard_owner_only(seeded_owner, seeded_viewer):
    payload = {"business_name": "TEST_Onboard", "industry": "SaaS", "website": "https://x",
               "description": "d", "brand_tone": "friendly", "reply_style": "concise",
               "support_email": "s@x.com", "support_phone": "", "timezone": "UTC"}
    r = requests.post(f"{BASE_URL}/api/tenant/onboard", headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
                      json=payload, timeout=10)
    assert r.status_code == 200
    assert r.json()["onboarded"] is True
    r2 = requests.post(f"{BASE_URL}/api/tenant/onboard", headers=H(seeded_viewer["jwt"], seeded_viewer["tid"]),
                       json=payload, timeout=10)
    assert r2.status_code == 403


# ---------- KB ----------
def test_kb_crud_and_rbac(seeded_owner, seeded_viewer):
    # viewer cannot POST
    r = requests.post(f"{BASE_URL}/api/kb", headers=H(seeded_viewer["jwt"], seeded_viewer["tid"]),
                      json={"kind": "faq", "title": "Q", "content": "A"}, timeout=10)
    assert r.status_code == 403

    r = requests.post(f"{BASE_URL}/api/kb", headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
                      json={"kind": "faq", "title": "TEST_Q", "content": "TEST_A"}, timeout=10)
    assert r.status_code == 200
    entry = r.json()
    assert entry["title"] == "TEST_Q" and "id" in entry

    r = requests.get(f"{BASE_URL}/api/kb", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert any(e["id"] == entry["id"] for e in r.json())

    r = requests.delete(f"{BASE_URL}/api/kb/{entry['id']}", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200


# ---------- Tenant isolation ----------
def test_tenant_isolation(seeded_owner, seeded_second_user):
    # owner of tenant A trying to access tenant B
    r = requests.get(f"{BASE_URL}/api/kb", headers=H(seeded_owner["jwt"], seeded_second_user["tid"]), timeout=10)
    assert r.status_code == 403


# ---------- Team invites/accept ----------
def test_team_invite_accept_flow(seeded_owner, seeded_second_user):
    r = requests.post(f"{BASE_URL}/api/team/invite", headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
                      json={"email": "second@example.com", "role": "moderator"}, timeout=10)
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["token"] and inv["role"] == "moderator"

    r = requests.get(f"{BASE_URL}/api/team/invites", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert any(i["token"] == inv["token"] for i in r.json())

    # Second user accepts (no X-Tenant-Id needed since accept uses get_current_user)
    r = requests.post(f"{BASE_URL}/api/team/accept/{inv['token']}",
                      headers=H(seeded_second_user["jwt"]), timeout=10)
    assert r.status_code == 200
    assert r.json()["tenant_id"] == seeded_owner["tid"]

    r = requests.get(f"{BASE_URL}/api/team/members", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    members = r.json()
    assert len(members) >= 2


# ---------- Leads ----------
def test_leads_list_and_patch_404(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/leads", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    r2 = requests.patch(f"{BASE_URL}/api/leads/nonexistent_id?status=qualified",
                        headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r2.status_code == 404


# ---------- Comments ----------
def test_comments_filter_no_crash(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/comments?sentiment=positive",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Approvals ----------
def test_approvals_list_and_404(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/approvals", headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    r2 = requests.post(f"{BASE_URL}/api/approvals/nonexistent/action",
                       headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
                       json={"action": "approve"}, timeout=10)
    assert r2.status_code == 404


# ---------- Analytics ----------
def test_analytics_overview_keys(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/analytics/overview",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    j = r.json()
    for k in ("total_comments_today", "ai_replies_today", "pending_approvals",
              "negative_comments", "total_leads", "pages_connected", "instagram_connected"):
        assert k in j, f"missing key {k}"
        assert isinstance(j[k], int)


def test_analytics_sentiment_trend(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/analytics/sentiment-trend?days=7",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, list) and len(j) == 7
    for d in j:
        assert {"date", "positive", "neutral", "negative"}.issubset(d.keys())


def test_analytics_categories(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/analytics/categories",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------- Pages discover (graceful Meta error) ----------
def test_pages_discover_meta_error_502(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/pages/discover",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=30)
    # Expected: 502 because the fake FB token will fail at Meta. Should not be 500.
    assert r.status_code == 502, f"got {r.status_code}: {r.text}"



# ====================================================================
# NEW (iteration 2): httpOnly cookie auth + /logout + /switch shape
# ====================================================================

# ---------- POST /api/auth/logout clears cookie ----------
def test_logout_returns_ok_and_clears_cookie():
    r = requests.post(f"{BASE_URL}/api/auth/logout", timeout=10)
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # Set-Cookie header should clear dashai_token (Max-Age=0 / expires past / empty value)
    sc = r.headers.get("set-cookie", "") or r.headers.get("Set-Cookie", "")
    assert "dashai_token" in sc.lower(), f"expected dashai_token in Set-Cookie, got: {sc!r}"
    low = sc.lower()
    assert ("max-age=0" in low) or ("expires=" in low and "1970" in low) or ('dashai_token=""' in low) or ("dashai_token=;" in low), \
        f"cookie not cleared: {sc!r}"


# ---------- POST /api/auth/switch/{tid} returns {ok, tenant_id} + sets cookie ----------
def test_switch_tenant_sets_cookie_and_returns_ok(seeded_owner):
    r = requests.post(
        f"{BASE_URL}/api/auth/switch/{seeded_owner['tid']}",
        headers=H(seeded_owner["jwt"]), timeout=10,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    # New shape: {ok, tenant_id} — NOT {token}
    assert j.get("ok") is True
    assert j.get("tenant_id") == seeded_owner["tid"]
    assert "token" not in j, "switch response must no longer contain 'token' (cookie-based now)"
    # Set-Cookie should contain a fresh JWT and be httponly
    sc = r.headers.get("set-cookie", "") or r.headers.get("Set-Cookie", "")
    assert "dashai_token=" in sc, f"missing dashai_token cookie: {sc!r}"
    assert "httponly" in sc.lower(), f"cookie must be HttpOnly: {sc!r}"
    # Cookie value should be a JWT (3 dot-separated segments)
    token_val = None
    for part in sc.split(";"):
        part = part.strip()
        if part.lower().startswith("dashai_token="):
            token_val = part.split("=", 1)[1]
            break
    assert token_val and token_val.count(".") == 2, f"cookie value not a JWT: {token_val!r}"


def test_switch_tenant_forbidden_for_non_member(seeded_owner, seeded_second_user):
    r = requests.post(
        f"{BASE_URL}/api/auth/switch/{seeded_second_user['tid']}",
        headers=H(seeded_owner["jwt"]), timeout=10,
    )
    assert r.status_code == 403


# ---------- Cookie-based auth on /api/auth/me ----------
def test_me_via_cookie_only(seeded_owner):
    s = requests.Session()
    s.cookies.set("dashai_token", seeded_owner["jwt"])
    # No Authorization header — cookie only
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["id"] == seeded_owner["uid"]
    assert any(t["id"] == seeded_owner["tid"] for t in j["tenants"])


# ---------- Cookie auth works for tenant-scoped endpoint ----------
def test_tenant_endpoint_via_cookie(seeded_owner):
    s = requests.Session()
    s.cookies.set("dashai_token", seeded_owner["jwt"])
    r = s.get(f"{BASE_URL}/api/tenant",
              headers={"X-Tenant-Id": seeded_owner["tid"]}, timeout=10)
    assert r.status_code == 200, r.text
    assert r.json()["id"] == seeded_owner["tid"]


# ---------- Invalid cookie -> 401 Invalid token ----------
def test_invalid_cookie_returns_401():
    s = requests.Session()
    s.cookies.set("dashai_token", "this.is.not-a-valid-jwt")
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert r.status_code == 401
    body = r.text.lower()
    assert "invalid token" in body, f"expected 'Invalid token', got: {r.text!r}"


# ---------- Expired cookie -> 401 ----------
def test_expired_cookie_returns_401(seeded_owner):
    # Build an expired JWT manually using same secret + algo
    import jwt as _jwt
    from datetime import datetime, timezone, timedelta
    secret = os.environ["JWT_SECRET"]
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired = _jwt.encode(
        {"sub": seeded_owner["uid"], "tid": seeded_owner["tid"], "exp": past},
        secret, algorithm="HS256",
    )
    s = requests.Session()
    s.cookies.set("dashai_token", expired)
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert r.status_code == 401
    assert "invalid token" in r.text.lower()


# ---------- Regression: Bearer header still accepted ----------
def test_bearer_header_still_works(seeded_owner):
    """Backwards compatibility — prior 27 tests rely on this; explicit guard."""
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=H(seeded_owner["jwt"]), timeout=10)
    assert r.status_code == 200
    assert r.json()["user"]["id"] == seeded_owner["uid"]


# ====================================================================
# Iteration 3: CSRF, audit, notifications, campaigns, leads/generate-dm, oauth state
# ====================================================================

# ---------- CSRF rejection: state-mutating without header -> 403 ----------
def test_csrf_missing_header_returns_403(seeded_owner):
    """Direct requests.Session bypasses our monkey-patched module-level requests.*,
    so we can hit the API without the X-CSRF-Token header even though the cookie is sent."""
    s = requests.Session()
    # seed the cookie first
    s.get(f"{BASE_URL}/api/health", timeout=10)
    # POST without X-CSRF-Token header — should be 403
    r = s.post(
        f"{BASE_URL}/api/kb",
        headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
        json={"kind": "faq", "title": "TEST_csrf", "content": "x"},
        timeout=10,
    )
    assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
    assert "csrf" in r.text.lower()


def test_csrf_wrong_header_returns_403(seeded_owner, csrf_token):
    s = requests.Session()
    s.cookies.set("dashai_csrf", csrf_token)
    r = s.post(
        f"{BASE_URL}/api/kb",
        headers={**H(seeded_owner["jwt"], seeded_owner["tid"]), "X-CSRF-Token": "wrong-value"},
        json={"kind": "faq", "title": "TEST_csrf2", "content": "x"},
        timeout=10,
    )
    assert r.status_code == 403


def test_csrf_patch_delete_also_protected(seeded_owner):
    s = requests.Session()
    s.get(f"{BASE_URL}/api/health", timeout=10)
    r = s.patch(
        f"{BASE_URL}/api/tenant",
        headers={**H(seeded_owner["jwt"], seeded_owner["tid"]), "Content-Type": "application/json"},
        data=json.dumps({"business_name": "no_csrf"}),
        timeout=10,
    )
    assert r.status_code == 403
    r2 = s.delete(
        f"{BASE_URL}/api/kb/some_id",
        headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
        timeout=10,
    )
    assert r2.status_code == 403


# ---------- CSRF exemption: webhook POST works WITHOUT X-CSRF-Token ----------
def test_webhook_post_is_csrf_exempt():
    body = json.dumps({"object": "page", "entry": []}).encode()
    sig = "sha256=" + hmac.new(FB_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()
    # raw Session with no CSRF cookie/header at all
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/webhooks/meta",
        data=body,
        headers={"Content-Type": "application/json", "x-hub-signature-256": sig},
        timeout=10,
    )
    assert r.status_code == 200, f"webhook should be CSRF-exempt, got {r.status_code}: {r.text}"


# ---------- GET /api/audit ----------
def test_audit_endpoint_returns_array(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/audit",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j, list)
    # schema check: if any entries exist they should have expected shape
    for entry in j:
        assert isinstance(entry, dict)


def test_audit_requires_auth():
    r = requests.get(f"{BASE_URL}/api/audit", timeout=10)
    assert r.status_code == 401


# ---------- GET /api/notifications & POST /read-all ----------
def test_notifications_initial_shape(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/notifications",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    assert isinstance(j, dict)
    assert "items" in j and "unread" in j
    assert isinstance(j["items"], list)
    assert isinstance(j["unread"], int)


def test_notifications_read_all(seeded_owner):
    r = requests.post(f"{BASE_URL}/api/notifications/read-all",
                      headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    # After read-all, unread should be 0
    r2 = requests.get(f"{BASE_URL}/api/notifications",
                      headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r2.status_code == 200
    assert r2.json()["unread"] == 0


# ---------- Campaigns ----------
def test_campaigns_list_initially_empty(seeded_owner):
    r = requests.get(f"{BASE_URL}/api/campaigns",
                     headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_campaigns_delete_nonexistent_404(seeded_owner):
    r = requests.delete(f"{BASE_URL}/api/campaigns/nonexistent_camp_id",
                        headers=H(seeded_owner["jwt"], seeded_owner["tid"]), timeout=10)
    assert r.status_code == 404, f"got {r.status_code}: {r.text}"


def test_campaigns_generate_viewer_forbidden(seeded_viewer):
    r = requests.post(
        f"{BASE_URL}/api/campaigns/generate",
        headers=H(seeded_viewer["jwt"], seeded_viewer["tid"]),
        json={"goal": "promote new product", "audience": "fans"},
        timeout=30,
    )
    assert r.status_code == 403, f"viewer should be forbidden, got {r.status_code}: {r.text}"


def test_campaigns_generate_owner_200_or_502(seeded_owner):
    r = requests.post(
        f"{BASE_URL}/api/campaigns/generate",
        headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
        json={"goal": "promote a sale", "audience": "existing customers"},
        timeout=60,
    )
    assert r.status_code in (200, 502), f"unexpected: {r.status_code}: {r.text}"


# ---------- Leads generate-dm ----------
def test_leads_generate_dm_nonexistent_404(seeded_owner):
    r = requests.post(
        f"{BASE_URL}/api/leads/nonexistent_lead_id/generate-dm",
        headers=H(seeded_owner["jwt"], seeded_owner["tid"]),
        timeout=15,
    )
    assert r.status_code == 404, f"got {r.status_code}: {r.text}"


# ---------- OAuth state persisted in Mongo ----------
def test_oauth_state_persisted_in_mongo():
    r = requests.get(f"{BASE_URL}/api/auth/facebook/login", timeout=10)
    assert r.status_code == 200
    state = r.json()["state"]
    assert state

    async def _check():
        doc = await dbmod.db.oauth_states.find_one({"state": state})
        return doc

    doc = asyncio.get_event_loop().run_until_complete(_check())
    assert doc is not None, f"oauth state {state} not found in db.oauth_states"
