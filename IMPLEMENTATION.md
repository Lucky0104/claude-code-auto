# Crysta IVF — Instagram Comment Auto-Reply SaaS — Implementation Notes

This document is the delivery summary for assembling the production Instagram
comment auto-reply platform into this repository. It records what was merged,
what already existed, what was added, and how to run/deploy everything.

> **TL;DR** — The full product already existed in the **primary** source
> repository (`aut0-c0mmentor1`). It was assembled here as the canonical base
> (dropping a stale duplicated copy), and then **hardened additively** with
> observability, sync rate-limiting, template sanitisation, a standalone
> migration script, frontend component tests, env templates, and deployment
> artifacts — **without rewriting any working system**.

---

## 1. Architecture summary

**Stack:** FastAPI + Motor (MongoDB) + httpx on the backend; React 19 + CRA/craco
+ TanStack Query + Axios + shadcn/ui on the frontend. Multi-tenant — every
collection is keyed by `tenant_id`. Auth is Facebook-OAuth-only, session via a
JWT in an httpOnly cookie (`dashai_token`), with CSRF double-submit and
`X-Hub-Signature-256`-verified Meta webhooks. Tokens are Fernet-encrypted at rest.

**Auto-reply flow (end to end):**

1. Meta posts a comment webhook → `POST /api/webhooks/meta` verifies the
   signature, persists the raw event, returns `200` immediately, and processes
   in a `BackgroundTask`.
2. The task dedups on `comment_logs.comment_id`, finds the `monitored_posts`
   entry for the media, loads its `campaigns` doc, and requires `is_configured`.
3. It renders the centre's reply (template variables `{doctor_name}`,
   `{center_name}`, `{phone}`, `{address}`, `{whatsapp}`, else the default IVF
   message) and posts it publicly via Graph `POST /{comment_id}/replies` using
   the tenant's first active page token (from `facebook_pages`).
4. The outcome is written to `comment_logs` (`replied`/`failed` + error), and the
   dashboard reads it via `GET /api/campaigns/comment-logs`.

**Source-repo decision (audit result):**

| Repo | Role | Verdict |
|---|---|---|
| `aut0-c0mmentor` (Repo 1) | scaffold | A throwaway Supabase "hello world" — **no pages, no routers, no business logic**. Its frontend is a strict subset of Repo 2 and its backend stack is incompatible (Supabase vs MongoDB). **Nothing merged** — merging it would break Repo 2. |
| `aut0-c0mmentor1` (Repo 2) | primary / final target | The complete product. Used as the canonical base here. |

Repo 2 contained a **stale duplicate** of the backend at the repo root
(`/core`, `/routers`, `/server.py`, `/requirements.txt`, `/tests`) alongside the
canonical `/backend/...`. The duplicate predated the IVF feature (it even lacked
`httpx` in its `requirements.txt`) and was never executed (the app runs from
`backend/`). It was **dropped** during assembly; only `backend/` is kept.

---

## 2. Database changes

No schema migration was required — the collections and indexes for the
auto-reply feature already exist. They are created idempotently on startup
(`core/db.ensure_indexes()`) and now also via a standalone migration script
(see §6).

**Collections** (Mongo name): `campaigns`, `monitored_posts`, `comment_logs`,
`webhook_events` (plus the pre-existing `users`, `tenants`, `tenant_members`,
`facebook_pages`, `instagram_accounts`, `oauth_states`, etc.).

**Indexes (Crysta-relevant):**

| Collection | Index | Properties |
|---|---|---|
| `comment_logs` | `comment_id` | **unique** (dedup) |
| `monitored_posts` | `(instagram_post_id, tenant_id)` | **unique** |
| `campaigns` | `(tenant_id, meta_synced_at desc)` | |
| `campaigns` | `(tenant_id, created_at desc)` | |
| `oauth_states` | `expires_at` | TTL |

Key conventions: a `campaigns` document's `_id` **is the Meta campaign id**
(string), surfaced to clients as `id`. `comment_logs` are keyed to a campaign by
`campaign_id`.

---

## 3. Backend files

**Added (new, additive — no behavioural change to existing routes):**

- `backend/core/observability.py` — structured JSON logging (`LOG_FORMAT=json|text`,
  `LOG_LEVEL`), a `log_event(...)` helper, and an in-process metrics counter registry.
- `backend/core/ratelimit.py` — per-tenant fixed-interval cooldown
  (`SYNC_RATE_LIMIT_SECONDS`, default 15s) used to throttle Meta syncs.
- `backend/core/sanitize.py` — `sanitize_field` / `sanitize_template` (strip
  control chars, collapse whitespace, cap length, preserve placeholders).
- `backend/routers/metrics.py` — `GET /api/metrics`, tenant-scoped (auth required):
  reply success/failure counts, monitoring-active count, configured-campaign count,
  last sync time (from the DB) + a process-counter snapshot.
- `backend/migrations/migrate.py` (+ `__init__.py`) — standalone, idempotent
  schema provisioning/verification script.
- `backend/.env.example` — all backend env vars documented.
- `backend/Dockerfile` — production image.
- `backend/tests/test_crysta_extensions.py`, `backend/tests/test_app_smoke.py` — see §5.

**Modified (surgical, additive only):**

- `backend/server.py` — replaced `logging.basicConfig(...)` with
  `observability.setup_logging()`; registered the `metrics` router; structured
  startup log. (CORS, CSRF, Mongo, router order otherwise untouched.)
- `backend/routers/campaigns.py` — `GET /sync` now enforces the per-tenant
  cooldown (HTTP 429 + `Retry-After`) and emits sync metrics/logs;
  `PATCH /{id}/center-config` now sanitises stored centre fields + template.
- `backend/routers/webhooks.py` — reply path now increments
  `reply.success`/`reply.failed`/`webhook.*` counters and emits a structured
  `webhook.reply` log. Reply logic, signature check, dedup, and DuplicateKey
  handling are unchanged.

**Untouched (per the non-negotiable rules):** auth, tenant, team, audit,
notifications, approvals, knowledge base, CORS, the Mongo connection, and the
env architecture.

---

## 4. Frontend files

The Campaigns and Comments pages already implement the spec (Meta-sync list +
centre-config detail with live preview + IG post monitoring toggles; filtered
comment-log activity feed). They were **not** rewritten. Added:

- `frontend/src/pages/__tests__/Campaigns.test.jsx` — component tests.
- `frontend/src/pages/__tests__/Comments.test.jsx` — component tests.
- `frontend/src/setupTests.js` — jest-dom + jsdom global polyfills.
- `frontend/.env.example` — `REACT_APP_BACKEND_URL`.
- `frontend/craco.config.js` — added a `jest.configure.moduleNameMapper` for the
  `@/` alias (so component tests resolve `@/components/ui/*`). Webpack/dev/build
  config is unchanged.
- `frontend/package.json` — added `@testing-library/{react,dom,jest-dom,user-event}`
  devDependencies.

---

## 5. Tests

**Backend (existing, run against a real Mongo + full env):**
`backend/tests/test_crysta.py` (24 structural tests: auth gating, CenterConfig
validation, indexes, dedup, monitor gating, comment-logs feed, webhook
reply/skip/failure, sync requires ad account, sync upsert, OAuth scopes, callback
stores `ad_account_id`) and `backend/tests/backend_test.py` (broader suite; note
the legacy `/campaigns/generate` tests fail **by design** — that endpoint was
intentionally removed for the IVF rewrite).

**Backend (added):**
- `tests/test_crysta_extensions.py` — pure unit tests for sanitise / ratelimit /
  observability (no Mongo/env required). **24 assertions, all passing.**
- `tests/test_app_smoke.py` — boots the app with placeholder env (Motor connects
  lazily, so no live Mongo needed) and verifies health/root, webhook verify
  (200 + 403), `/api/metrics` and `/api/campaigns/sync` auth-gating, and that the
  new metrics route is registered.

Run the no-Mongo suites:
```bash
cd backend && python -m pytest tests/test_crysta_extensions.py tests/test_app_smoke.py -q
```
Run the full backend suite (needs Mongo + env):
```bash
cd backend && python -m pytest tests/test_crysta.py -q
```

**Frontend (added):** `craco test` component tests for the Campaigns and Comments
pages (mock the api/sonner/icons, render with a `QueryClientProvider`, assert
empty states, filters, sync control, and rendered rows).
```bash
cd frontend && CI=true yarn test
```

---

## 6. Migration scripts

`backend/migrations/migrate.py` — idempotent. Ensures the Crysta collections
exist and (re)creates all indexes via `ensure_indexes()`, then prints the index
state. The app also ensures indexes on startup, so this is an optional explicit
deploy step.
```bash
cd backend && python -m migrations.migrate
```

---

## 7. Environment variables

See `backend/.env.example` and `frontend/.env.example`. Backend (required unless
noted):

| Var | Purpose |
|---|---|
| `MONGO_URL`, `DB_NAME` | MongoDB connection |
| `JWT_SECRET` | signs session JWTs |
| `FERNET_KEY` | encrypts FB/page tokens at rest (`Fernet.generate_key()`) |
| `FB_GRAPH_VERSION` | Graph API version, e.g. `v21.0` |
| `FB_APP_ID`, `FB_APP_SECRET`, `FB_REDIRECT_URI` | Meta app OAuth |
| `FB_WEBHOOK_VERIFY_TOKEN` | webhook verification handshake |
| `FRONTEND_URL` | post-OAuth redirect target |
| `CORS_ORIGINS` | comma-separated allowed origins (optional, default `*`) |
| `EMERGENT_LLM_KEY` | only for legacy AI (`core/ai.py`); not needed by the bot |
| `LOG_FORMAT`, `LOG_LEVEL` | observability (optional; `json`/`INFO` default) |
| `SYNC_RATE_LIMIT_SECONDS` | per-tenant sync cooldown (optional; `15`, `0` disables) |

Frontend: `REACT_APP_BACKEND_URL` (backend base URL, no trailing slash; app appends `/api`).

---

## 8. Setup instructions (local)

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # fill in Meta creds + secrets; generate FERNET_KEY
python -m migrations.migrate    # optional: provision indexes
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend**
```bash
cd frontend
cp .env.example .env            # set REACT_APP_BACKEND_URL
yarn install
yarn start                      # http://localhost:3000
```

**Or everything at once:** `cp backend/.env.example backend/.env && docker compose up --build`.

---

## 9. Deployment instructions

- **Backend:** build `backend/Dockerfile` and run
  `uvicorn server:app --host 0.0.0.0 --port $PORT`. Provide all env vars via your
  secrets manager. Set `LOG_FORMAT=json` for structured logs. Point a managed
  MongoDB at `MONGO_URL`. Run `python -m migrations.migrate` as a release step.
- **Frontend:** `yarn build` and serve the static `build/` behind your web
  server/CDN with `REACT_APP_BACKEND_URL` baked at build time.
- **Meta app:** configure the OAuth redirect to match `FB_REDIRECT_URI`; set the
  Instagram/Page webhook callback to `https://<api-host>/api/webhooks/meta` with
  `FB_WEBHOOK_VERIFY_TOKEN`; subscribe the page to `comments`/`feed`. Required
  scopes are already requested by `core/meta.DEFAULT_SCOPES`.
- **Note:** `core/ai.py` imports the out-of-band `emergentintegrations` package
  (legacy DM drafting only). It is not needed by the auto-comment bot and is not
  installed by the Dockerfile; install it separately if you use those features.

---

## 10. Security notes

- Webhook signatures verified (`X-Hub-Signature-256` HMAC) before processing.
- Every tenant-scoped query includes `tenant_id`; the metrics endpoint scopes all
  counts to the caller's tenant.
- Reply templates and centre fields are sanitised before storage.
- Meta sync is rate-limited per tenant (in addition to Meta's own 429 → 503 mapping).
- Tokens are Fernet-encrypted at rest and never returned to clients.
