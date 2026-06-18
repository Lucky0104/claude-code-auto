"""Import + wiring smoke tests that do NOT require a live MongoDB.

Placeholder env vars (and a freshly generated Fernet key) are set BEFORE
importing the app. Motor connects lazily, so importing the app and hitting
non-DB routes never opens a Mongo connection. This verifies the app boots,
routers (including the new /api/metrics) are registered, and auth gating works.

Run: cd backend && python -m pytest tests/test_app_smoke.py -q
"""
import os

from cryptography.fernet import Fernet

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "crysta_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("FERNET_KEY", Fernet.generate_key().decode())
os.environ.setdefault("FB_GRAPH_VERSION", "v21.0")
os.environ.setdefault("FB_APP_ID", "test-app-id")
os.environ.setdefault("FB_APP_SECRET", "test-app-secret")
os.environ.setdefault("FB_REDIRECT_URI", "http://localhost:8001/api/auth/facebook/callback")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("FB_WEBHOOK_VERIFY_TOKEN", "verify-tok")
os.environ.setdefault("EMERGENT_LLM_KEY", "test-llm-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402

# Do NOT use `with TestClient(...)`: that fires startup events (ensure_indexes)
# which would require a live Mongo. Plain instantiation skips lifespan.
client = TestClient(server.app)


def test_health_ok():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_root_ok():
    r = client.get("/api/")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_webhook_verify_echoes_challenge():
    r = client.get(
        "/api/webhooks/meta",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "verify-tok",
            "hub.challenge": "12345",
        },
    )
    assert r.status_code == 200
    assert r.text == "12345"


def test_webhook_verify_wrong_token_403():
    r = client.get(
        "/api/webhooks/meta",
        params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "x"},
    )
    assert r.status_code == 403


def test_metrics_requires_auth():
    r = client.get("/api/metrics")
    assert r.status_code == 401


def test_sync_requires_auth():
    r = client.get("/api/campaigns/sync")
    assert r.status_code in (401, 403)


def test_metrics_route_registered():
    paths = {getattr(r, "path", None) for r in server.app.routes}
    assert "/api/metrics" in paths
