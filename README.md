# ivf-reply-bot — Crysta IVF Auto-Comment Bot

> Multi-tenant SaaS that auto-replies to Instagram comments on boosted Meta Ad campaigns with a per-city centre's doctor / clinic details. Each Meta campaign maps to one centre. When someone comments on the boosted Instagram post for a campaign, the bot posts a **public comment reply** containing that centre's doctor name, address, phone number, and (optionally) WhatsApp.

Built for **Crysta IVF** but generic enough for any multi-location service business running per-city Meta ad campaigns.

---

## Table of Contents

1.  [What it does](#what-it-does)
2.  [Architecture overview](#architecture-overview)
3.  [Tech stack](#tech-stack)
4.  [Repo layout](#repo-layout)
5.  [Prerequisites](#prerequisites)
6.  [Meta / Facebook app setup](#meta--facebook-app-setup)
7.  [Environment variables](#environment-variables)
8.  [Local development setup](#local-development-setup)
9.  [Database schema](#database-schema)
10. [OAuth login flow (end-to-end)](#oauth-login-flow-end-to-end)
11. [Webhook flow (end-to-end)](#webhook-flow-end-to-end)
12. [REST API reference](#rest-api-reference)
13. [Frontend pages & routing](#frontend-pages--routing)
14. [Configuring a campaign (admin UX)](#configuring-a-campaign-admin-ux)
15. [Testing](#testing)
16. [Deployment](#deployment)
17. [Operations & debugging](#operations--debugging)
18. [Known limitations & roadmap](#known-limitations--roadmap)
19. [License](#license)

---

## What it does

**Problem.** A clinic chain runs separate Meta ad campaigns for each city (Delhi, Bengaluru, Mumbai, etc.). Each boosted Instagram post drives DM-curious commenters who ask "where are you located?", "what's the price?", "Dr.'s name?". Replying manually per city is slow, inconsistent and gets missed.

**Solution.** Connect your Facebook Page + Instagram Business Account, sync your Meta campaigns, configure each campaign with its centre's doctor / clinic info, then toggle "monitor" on the Instagram posts you care about. From that moment on, any comment on those posts gets a near-instant public reply with the right centre's contact details. Every reply is logged in an audit feed.

**Key properties:**
- **Multi-tenant.** Every collection is keyed by `tenant_id`. RBAC: `owner`, `admin`, `moderator`, `viewer`.
- **Real Meta data.** No mocks. OAuth, campaigns, posts, replies all go through Meta Graph API.
- **Dedup-safe.** The same `comment_id` cannot be replied to twice even if Meta retries the webhook.
- **Operator-gated.** A campaign cannot be monitored until its centre details are saved.
- **Secure.** Page access tokens are Fernet-encrypted at rest; JWT in `httpOnly` cookie; CSRF double-submit on mutating routes; HMAC-SHA256 signature verification on webhooks.

---

## Architecture overview

```
┌──────────────┐   OAuth (FB)     ┌────────────────┐
│  Frontend    │  ───────────►    │   Meta Graph   │
│  React 19    │                  │     v22.0      │
│              │  ◄────────────   └────────────────┘
└──────┬───────┘     JWT (httpOnly cookie)       ▲
       │  axios + TanStack Query                  │ httpx
       ▼                                          │
┌──────────────┐                          ┌───────┴────────┐
│  FastAPI     │  ─────  webhooks  ───►   │  Meta Webhook  │
│  /api/*      │  ◄──  POST /webhooks/meta│  (Instagram    │
│              │       (HMAC verified)    │   comments)    │
└──────┬───────┘                          └────────────────┘
       │  motor (async)
       ▼
┌──────────────┐
│  MongoDB     │  (tenants, users, pages, campaigns,
│              │   monitored_posts, comment_logs,
│              │   webhook_events, audit_logs, ...)
└──────────────┘
```

**Request lifecycle for an auto-reply:**

1. Reader comments on an Instagram post that an admin has flipped to "monitoring active".
2. Meta fires a webhook to `POST /api/webhooks/meta` with HMAC signature.
3. Backend verifies the HMAC, persists the raw payload to `webhook_events`, returns `200 OK` immediately.
4. A FastAPI `BackgroundTask` parses the payload, dedups against `comment_logs.comment_id` (unique index), looks up the campaign by `monitored_posts.instagram_post_id`, renders the reply from the centre template (or the default).
5. Reply is posted to `POST {GRAPH}/{comment_id}/replies` with the page's access token (Fernet-decrypted from `facebook_pages.access_token_enc`).
6. Result (success or failure) is inserted into `comment_logs` for the audit feed.

---

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Backend | **FastAPI 0.110**, **Python 3.11**, **Motor 3.3** (async MongoDB), **httpx 0.27**, **pydantic 2** | Async I/O for Meta + Mongo, modern Python types |
| Auth | JWT (PyJWT) in `httpOnly` cookie + CSRF double-submit | Resists XSS + CSRF |
| Encryption | **Fernet** (`cryptography`) for FB tokens | Symmetric AES-128-CBC + HMAC |
| DB | MongoDB (Atlas or self-hosted) | Flexible doc schema, TTL for OAuth states |
| Frontend | **React 19**, **React Router 7**, **TanStack Query 5**, **shadcn/ui**, **Tailwind**, **Axios**, **Sonner** | Modern React + great DX |
| Build | **CRACO 7** (React Scripts override), **yarn** | Custom Webpack hooks |
| Process supervisor | `supervisord` | Hot-reload friendly |

---

## Repo layout

```
/app
├── backend/
│   ├── server.py                # FastAPI app entry point, mounts /api router
│   ├── requirements.txt
│   ├── .env                     # NEVER commit — see "Environment variables"
│   ├── core/
│   │   ├── db.py                # Motor client, collections, ensure_indexes()
│   │   ├── meta.py              # Meta Graph helper (OAuth + Pages + IG + webhooks signature)
│   │   ├── security.py          # JWT encode/decode + Fernet encrypt/decrypt
│   │   ├── csrf.py              # CSRF double-submit middleware
│   │   ├── deps.py              # FastAPI deps: get_current_user, get_current_tenant, require_role
│   │   ├── ai.py                # (legacy) Claude helpers used by older AI features
│   │   ├── events.py            # In-app notification + audit helpers
│   │   └── models.py            # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py              # OAuth login + callback (Step 0: stores ad_account_id)
│   │   ├── tenant.py            # Workspace settings, onboarding, switch
│   │   ├── pages.py             # Connect FB Pages + IG accounts
│   │   ├── instagram.py         # IG account inspection
│   │   ├── campaigns.py         # ★ Crysta IVF: sync + center-config + posts + monitor + comment-logs
│   │   ├── webhooks.py          # ★ Crysta IVF: Meta webhook -> BackgroundTask reply
│   │   ├── comments.py          # Legacy comment management (manual approval / classify)
│   │   ├── approvals.py         # Approval queue (manual reply review)
│   │   ├── leads.py             # Lead detection + DM generator
│   │   ├── kb.py                # Knowledge base CRUD
│   │   ├── team.py              # Invite + RBAC
│   │   ├── analytics.py         # KPIs, trends
│   │   ├── audit.py             # Audit log feed
│   │   └── notifications.py     # In-app notifications + unread badge
│   └── tests/
│       ├── backend_test.py      # Original suite (legacy tests)
│       └── test_crysta.py       # ★ 24 structural tests for the IVF feature
├── frontend/
│   ├── package.json
│   ├── craco.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── .env                     # REACT_APP_BACKEND_URL=...
│   └── src/
│       ├── index.js
│       ├── App.js               # Router + providers (Query, Auth, Sonner)
│       ├── lib/
│       │   ├── api.js           # axios instance w/ creds + CSRF echo
│       │   ├── auth.jsx         # React context + hook
│       │   └── utils.js
│       ├── components/
│       │   ├── AppShell.jsx
│       │   ├── ProtectedRoute.jsx
│       │   └── ui/              # shadcn/ui components
│       └── pages/
│           ├── Login.jsx
│           ├── OAuthSuccess.jsx
│           ├── Onboarding.jsx
│           ├── Dashboard.jsx
│           ├── Pages.jsx
│           ├── Campaigns.jsx    # ★ Crysta IVF list + detail + monitor toggles
│           ├── Comments.jsx     # ★ Crysta IVF auto-reply feed
│           ├── Approvals.jsx
│           ├── Leads.jsx
│           ├── KnowledgeBase.jsx
│           ├── Team.jsx
│           ├── Analytics.jsx
│           ├── AuditLogs.jsx
│           ├── Settings.jsx
│           └── AcceptInvite.jsx
└── memory/PRD.md
```

The five files marked **★** are the core of the Crysta IVF feature. Everything else is the multi-tenant chassis it sits on.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| Node | 18+ |
| Yarn | 1.22.x |
| MongoDB | 4.4+ (Atlas free tier works) |
| A Facebook app | In Development mode (or App Reviewed) |
| HTTPS reachable domain | For OAuth callback + webhook |

You also need an Ads-enabled Meta Business account, a Facebook Page linked to an **Instagram Business / Creator account**, and at least one **boosted post** under a campaign.

---

## Meta / Facebook app setup

This is the most time-consuming part. Do it once, carefully.

### 1. Create the Meta app
- Go to <https://developers.facebook.com/apps/>, click **Create app**.
- Type: **Business**.
- Add the **Facebook Login** product, **Instagram Graph API** product, and **Webhooks** product.

### 2. Required OAuth scopes
Configured in code at `backend/core/meta.py → DEFAULT_SCOPES`:
- `public_profile`
- `email`
- `pages_show_list`
- `business_management`
- `ads_read`                  *(for `/me/adaccounts` and `/act_{id}/campaigns`)*
- `pages_read_engagement`     *(for `{page}/ads` + reading comments)*
- `pages_manage_engagement`   *(for posting comment replies)*
- `instagram_manage_comments` *(for IG reply API)*

If the Meta app is in Development mode, every tester / developer must be added at `https://developers.facebook.com/apps/{APP_ID}/roles/`. Production usage requires **App Review** to unlock these scopes.

### 3. Redirect URI
Add your `FB_REDIRECT_URI` (e.g. `https://your-domain.com/api/auth/facebook/callback`) under **Facebook Login → Settings → Valid OAuth Redirect URIs**.

### 4. Webhook subscription
- Under **Webhooks → Instagram**, click **Edit subscription**.
- Callback URL: `https://your-domain.com/api/webhooks/meta`
- Verify token: your `FB_WEBHOOK_VERIFY_TOKEN` (any random string you also put in `.env`).
- Subscribe to the field: **`comments`**.

The backend's `GET /api/webhooks/meta` returns the `hub.challenge` and signs `POST` payloads with `X-Hub-Signature-256` (HMAC-SHA256 using your **App Secret**).

### 5. Page subscription
For each Page the bot should listen on, the backend calls `POST /{page-id}/subscribed_apps` with `subscribed_fields=feed,comments,mention`. This happens automatically in `routers/pages.py` when an admin connects a page in the **Pages** screen.

### 6. Ad account
The OAuth callback calls `GET /me/adaccounts?fields=id,account_id,account_status,name` and picks the first ad account where `account_status == 1` (ACTIVE). Its bare numeric id (without the `act_` prefix) is persisted as `tenants.ad_account_id`. If the user has zero active ad accounts, `ad_account_id` is `null` and `Sync from Meta` will return `400 "No ad account found. Please reconnect Facebook."`.

---

## Environment variables

### `backend/.env`

| Variable | Required | Purpose | Example |
|---|---|---|---|
| `MONGO_URL` | yes | Mongo connection string | `mongodb+srv://user:pass@cluster.mongodb.net` |
| `DB_NAME` | yes | Mongo database name | `dashai` |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins (frontend URL) | `https://app.example.com` |
| `JWT_SECRET` | yes | HS256 signing secret | `openssl rand -hex 32` |
| `FERNET_KEY` | yes | Symmetric key for FB token encryption — must be a Fernet 32-byte url-safe base64 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `FB_APP_ID` | yes | Meta app id | `1757065258767013` |
| `FB_APP_SECRET` | yes | Meta app secret (also used for HMAC) | `abcd1234...` |
| `FB_REDIRECT_URI` | yes | OAuth callback URL (must match Meta config exactly) | `https://api.example.com/api/auth/facebook/callback` |
| `FB_WEBHOOK_VERIFY_TOKEN` | yes | Shared secret for `hub.verify_token` | `any-random-string` |
| `FB_GRAPH_VERSION` | yes | Meta Graph API version | `v22.0` |
| `FRONTEND_URL` | yes | Where to redirect after OAuth success | `https://app.example.com` |
| `EMERGENT_LLM_KEY` | optional | LLM key for legacy AI features (Claude classify) | `sk-emergent-...` |

### `frontend/.env`

| Variable | Required | Purpose | Example |
|---|---|---|---|
| `REACT_APP_BACKEND_URL` | yes | Backend public URL (axios `baseURL`) | `https://api.example.com` |
| `WDS_SOCKET_PORT` | optional | Hot-reload websocket port (Kubernetes preview) | `443` |
| `ENABLE_HEALTH_CHECK` | optional | Enables Webpack health endpoint | `false` |

Generating secrets quickly:
```bash
# JWT_SECRET
openssl rand -hex 32

# FERNET_KEY  (must be exactly this format)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# FB_WEBHOOK_VERIFY_TOKEN
openssl rand -base64 24
```

> ⚠️ Never commit `.env`. Rotate `FERNET_KEY` only with a re-encryption plan — old tokens become unreadable.

---

## Local development setup

```bash
# 1) Clone
git clone <your-repo-url> ivf-reply-bot
cd ivf-reply-bot

# 2) Backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in real values
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 3) Frontend (in a second terminal)
cd ../frontend
yarn install
cp .env.example .env   # set REACT_APP_BACKEND_URL to http://localhost:8001
yarn start
```

The frontend dev server runs on `http://localhost:3000` and proxies API calls to `REACT_APP_BACKEND_URL`. The backend serves all routes under `/api/*`.

### Public URL for OAuth + Webhooks during dev
Meta cannot reach `localhost`. Use one of:
- **ngrok**: `ngrok http 8001` → use the HTTPS URL as `FB_REDIRECT_URI` base and webhook callback.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8001`.

Update `FB_REDIRECT_URI` in both `.env` AND in the Meta app's **Valid OAuth Redirect URIs** screen.

---

## Database schema

All collections except `users` and `oauth_states` are keyed by `tenant_id`.

### `users`
| Field | Type | Description |
|---|---|---|
| `id` | string (uuid4) | App user id |
| `fb_user_id` | string | Facebook user id (**unique sparse index**) |
| `name`, `email`, `picture` | string | From `/me` |
| `fb_access_token` | string (Fernet-encrypted) | Long-lived user token |
| `created_at` | ISO datetime | |

### `tenants`
| Field | Type | Description |
|---|---|---|
| `id` | string (uuid4) | Tenant id |
| `business_name`, `industry`, `website`, `description`, `support_email`, `support_phone`, `timezone` | string | Workspace meta |
| `owner_user_id` | string | First user id |
| `auto_reply_enabled` | bool | Master kill-switch |
| `brand_tone`, `reply_style` | string | Used by legacy AI features |
| **`ad_account_id`** | string \| null | **Bare numeric Meta ad account id (no `act_` prefix).** Set on OAuth callback. |
| **`ad_account_synced_at`** | ISO datetime \| null | When the above was last fetched |
| `onboarded` | bool | |
| `created_at` | ISO datetime | |

### `tenant_members`
| Field | Type | Description |
|---|---|---|
| `user_id`, `tenant_id` | string | **Unique compound index** |
| `role` | enum: `owner` / `admin` / `moderator` / `viewer` | RBAC |
| `created_at` | ISO datetime | |

### `facebook_pages`
| Field | Type | Description |
|---|---|---|
| `tenant_id`, `page_id` | string | **Unique compound index** |
| `name`, `category`, `picture`, `tasks` | mixed | From `/me/accounts` |
| `access_token_enc` | string (Fernet) | Page access token, encrypted |
| `is_active` (or legacy `active`) | bool | Webhook subscription state |
| `connected_at` | ISO datetime | |

### `campaigns` *(★ Crysta IVF — note `_id` is the Meta campaign id)*
| Field | Type | Description |
|---|---|---|
| `_id` | string | **Meta campaign id** (no separate `id` field for synced campaigns) |
| `tenant_id` | string | |
| `name`, `status`, `objective` | string | From Meta |
| `daily_budget`, `lifetime_budget` | string (smallest currency unit, e.g. paise for INR) | |
| `start_time`, `stop_time`, `meta_created_time` | ISO datetime | |
| `ad_account_id` | string | The ad account this campaign belongs to |
| `meta_synced_at` | ISO datetime | When we last synced |
| **`center_name`** | string \| null | e.g. "Bengaluru – Indiranagar" |
| **`doctor_name`** | string \| null | Required to enable monitoring |
| **`address`** | string \| null | Required |
| **`phone`** | string \| null | Required |
| **`whatsapp`** | string \| null | Optional |
| **`reply_template`** | string \| null | Variables: `{doctor_name} {center_name} {phone} {address} {whatsapp}`. If `null`, default template is used. |
| **`is_configured`** | bool | Gates monitoring toggle |
| `configured_at`, `configured_by` | ISO datetime / user_id | |
| `created_at` | ISO datetime | |

**Indexes:**
- `(tenant_id ASC, created_at DESC)`
- `(tenant_id ASC, meta_synced_at DESC)`

### `monitored_posts` *(★ Crysta IVF)*
| Field | Type | Description |
|---|---|---|
| `instagram_post_id`, `tenant_id` | string | **Unique compound index** |
| `campaign_id` | string | FK → `campaigns._id` |
| `instagram_permalink` | string | `https://instagram.com/p/...` (or `/reel/`) |
| `is_active` | bool | Monitoring toggle |
| `activated_at`, `activated_by` | ISO datetime / user_id | |
| `deactivated_at`, `deactivated_by` | ISO datetime / user_id | |

### `comment_logs` *(★ Crysta IVF)*
| Field | Type | Description |
|---|---|---|
| `comment_id` | string | **Unique index** (dedup key) |
| `campaign_id` | string | FK → `campaigns._id` |
| `instagram_post_id` | string | The IG post the comment is on |
| `instagram_permalink` | string | For "View post" link |
| `tenant_id` | string | |
| `commenter_id`, `commenter_name` | string | From webhook |
| `comment_text` | string | Original comment |
| `reply_sent` | string | Final reply text (empty if failed) |
| `replied_at` | ISO datetime | |
| `status` | enum: `replied` / `failed` / `skipped` | |
| `error` | string \| null | Meta error message on failure |

### `webhook_events`
Raw webhook payloads for audit / replay.
| Field | Type | Description |
|---|---|---|
| `received_at` | ISO datetime | |
| `payload` | object | Verbatim Meta webhook body |

### `comments`, `replies`, `approval_queue`, `leads`, `knowledge_base`, `notifications`, `audit_logs`, `team_invites`, `tenant_settings`, `instagram_accounts`, `posts`
Used by legacy / non-IVF features (Claude classification, lead detection, approval queue, KB-RAG, team invites, analytics, etc.). Schemas are stable; see `core/db.py` and the corresponding router.

### `oauth_states`
TTL collection for CSRF protection on the OAuth `state` parameter. Auto-expires via `expireAfterSeconds=0` on the `expires_at` field (10 minutes).

---

## OAuth login flow (end-to-end)

```
Browser                 Frontend            Backend                Meta
   │                       │                   │                     │
   │   click "Continue     │                   │                     │
   │   with Facebook"      │                   │                     │
   │ ─────────────────────►│                   │                     │
   │                       │ GET /api/auth/    │                     │
   │                       │ facebook/login    │                     │
   │                       │ ─────────────────►│                     │
   │                       │                   │  Insert oauth_state │
   │                       │                   │  row (TTL=10min)    │
   │                       │ ◄─────────────────│                     │
   │                       │ {url, state}      │                     │
   │                       │                   │                     │
   │   browser redirects to Meta dialog        │                     │
   │ ──────────────────────────────────────────────────────────────► │
   │                       │                   │                     │
   │   user grants scopes; Meta redirects back │                     │
   │ ◄────────────────────────────────────────────────────────────── │
   │   GET FB_REDIRECT_URI?code=...&state=...  │                     │
   │ ──────────────────────────────────────────►                     │
   │                       │                   │  validate state     │
   │                       │                   │  POST oauth/access_token (exchange code)
   │                       │                   │ ──────────────────► │
   │                       │                   │ ◄────────────────── │
   │                       │                   │  exchange short→long token
   │                       │                   │  GET /me            │
   │                       │                   │  GET /me/adaccounts │
   │                       │                   │     pick first      │
   │                       │                   │     account_status=1│
   │                       │                   │  upsert user        │
   │                       │                   │  upsert tenant with │
   │                       │                   │     ad_account_id   │
   │                       │                   │  issue JWT in       │
   │                       │                   │     dashai_token    │
   │                       │                   │     httpOnly cookie │
   │   302 → /oauth/success                    │                     │
   │ ◄─────────────────────────────────────────                      │
```

**Implemented in:** `backend/routers/auth.py`, `backend/core/meta.py`.

### Step 0 — Why `ad_account_id` matters
Every Meta campaign lives inside an ad account. To `GET /act_{id}/campaigns`, you must know the id. Rather than asking each user to copy/paste it from Ads Manager (and risk typos), we fetch `/me/adaccounts` at login and pick the first ACTIVE one. The bare numeric form (e.g. `555000111`, not `act_555000111`) is stored.

If the user manages multiple ad accounts, only the first ACTIVE is auto-picked. A future enhancement: a workspace settings page to switch.

### JWT details (`core/security.py`)
- Algorithm: `HS256`.
- Payload: `{sub: user_id, tid: active_tenant_id, exp, iat}`.
- Lifetime: 7 days.
- Stored as `dashai_token` cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `path=/`.
- Decoded by `core/deps.py:get_current_user`.

### CSRF (`core/csrf.py`)
- Double-submit cookie pattern.
- On the first GET (any path), the middleware sets a non-`HttpOnly` `dashai_csrf` cookie.
- On state-mutating requests (`POST`/`PATCH`/`PUT`/`DELETE`), the client must send the same value back as the `X-CSRF-Token` header.
- Frontend's axios instance reads the cookie and adds the header automatically (`frontend/src/lib/api.js`).
- Exempt paths: `/api/webhooks/meta` (Meta signs payloads with HMAC).

---

## Webhook flow (end-to-end)

### Verification (`GET /api/webhooks/meta`)
Meta calls this once during webhook setup:
```
GET /api/webhooks/meta?hub.mode=subscribe&hub.verify_token=<your-token>&hub.challenge=<nonce>
```
The backend returns `hub.challenge` (plain text) iff `hub.verify_token == FB_WEBHOOK_VERIFY_TOKEN`. Otherwise `403`.

### Delivery (`POST /api/webhooks/meta`)

```
Meta ─► POST /api/webhooks/meta
        body: {entry: [{changes: [{value: {comment_id, media: {id}, from: {id, name}, text, verb}}]}]}
        headers: X-Hub-Signature-256: sha256=<hmac>

Backend
 1. verify_signature(body, header) using FB_APP_SECRET
    └── if invalid → 401
 2. insert raw payload into webhook_events
 3. add BackgroundTask(_process_payload, payload)
 4. return 200 IMMEDIATELY (Meta retries on slow 200s)

Background task (per change.value):
 a. extract comment_id, media_id (instagram_post_id), from.id, text
 b. skip if verb != "add"
 c. DEDUP: find_one(comment_logs, {comment_id}) → if exists, stop
 d. MONITOR CHECK: find_one(monitored_posts, {instagram_post_id, is_active:true}) → if none, stop
 e. CAMPAIGN: find_one(campaigns, {_id: monitored.campaign_id})
 f. CONFIG CHECK: if !is_configured, stop (defensive — UI already blocks this)
 g. PAGE TOKEN: pick first active facebook_pages row for this tenant_id,
    decrypt access_token_enc with Fernet
 h. RENDER REPLY:
    if reply_template: replace {doctor_name}/{center_name}/{phone}/{address}/{whatsapp}
    else: default template
 i. POST {GRAPH}/{comment_id}/replies
        data={message, access_token=page_token}
        timeout=10s
 j. insert comment_logs with status='replied' (or 'failed' + error)
    DuplicateKeyError swallowed (concurrent delivery)
```

**Implemented in:** `backend/routers/webhooks.py`.

### Why FastAPI `BackgroundTasks` (and not Celery)?
Meta retries any webhook that doesn't return 200 within ~5 seconds. We acknowledge in <50ms and process asynchronously. `BackgroundTasks` runs in the same event loop, which is fine for our volume (<100 replies/sec). Move to Celery + Redis when you outgrow that.

---

## REST API reference

All routes are prefixed with `/api`. All routes except `/api/auth/facebook/*`, `/api/webhooks/meta`, and `/api/health` require a valid `dashai_token` cookie + (for mutating routes) a matching `X-CSRF-Token` header.

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/` | none | `{"app":"DashAI","status":"ok"}` |
| GET | `/api/health` | none | `{"ok":true}` |

### Auth (`routers/auth.py`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/facebook/login` | none | Returns `{url, state}` — redirect user to `url` |
| GET | `/api/auth/facebook/callback?code&state` | none | OAuth handshake. Exchanges code, fetches `/me` + `/me/adaccounts`, upserts user + tenant, sets `dashai_token` cookie, 302 to `${FRONTEND_URL}/oauth/success` |
| POST | `/api/auth/logout` | cookie | Clears `dashai_token` |
| GET | `/api/auth/me` | cookie | Returns `{user, tenants[], active_tenant_id}` |
| POST | `/api/auth/switch/{tenant_id}` | cookie | Re-issues JWT for a different tenant the user is a member of |

### Tenant (`routers/tenant.py`)
Update workspace settings (brand tone, auto-reply toggle, onboarded flag, etc.).

### Pages (`routers/pages.py`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/pages/available` | Lists Pages from `/me/accounts` |
| POST | `/api/pages/connect` | Connects a Page, encrypts its access token, subscribes webhook fields |
| DELETE | `/api/pages/{page_id}` | Disconnects a Page |

### Instagram (`routers/instagram.py`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/instagram/account` | Returns IG Business Account for the active page |

### Campaigns (`routers/campaigns.py`) ★ Crysta IVF
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/campaigns/sync` | owner/admin | Calls `/act_{ad_account_id}/campaigns?filtering=[…effective_status IN ACTIVE,PAUSED]`, upserts. 400 if tenant has no `ad_account_id`. 429 → 503. Other Meta errors → 502 |
| GET | `/api/campaigns` | member | List all campaigns for tenant, sorted `meta_synced_at` desc, with `monitored_posts_count` |
| GET | `/api/campaigns/{id}` | member | Single campaign doc |
| PATCH | `/api/campaigns/{id}/center-config` | owner/admin | Body: `{center_name?, doctor_name, address, phone, whatsapp?, reply_template?}`. Sets `is_configured=true` |
| GET | `/api/campaigns/{id}/posts` | member | Calls `/{campaign_id}/ads`, extracts permalinks, joins monitor state + reply counts |
| POST | `/api/campaigns/{id}/posts/{post_id}/monitor` | owner/admin | Activate monitoring. **400 if not configured**. Upserts `monitored_posts` |
| DELETE | `/api/campaigns/{id}/posts/{post_id}/monitor` | owner/admin | Deactivate monitoring |
| GET | `/api/campaigns/comment-logs` | member | Auto-reply feed. Query params: `campaign_id`, `center_name`, `status` (`replied`/`failed`/`skipped`), `date_from`, `date_to`, `q`, `limit` (≤500) |

### Webhooks (`routers/webhooks.py`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/webhooks/meta` | hub.verify_token | Meta subscription verification |
| POST | `/api/webhooks/meta` | HMAC-SHA256 | Async comment processing (see [Webhook flow](#webhook-flow-end-to-end)) |

### Other routers (chassis)
- `comments` — legacy comment ingestion + classification
- `approvals` — manual reply queue
- `leads` — lead detection + DM generator
- `kb` — knowledge base CRUD
- `team` — invites + RBAC
- `analytics` — KPIs, sentiment trend, category distribution, top pages
- `audit` — audit log feed
- `notifications` — in-app bell with unread badge

See each router file for the per-route signature.

---

## Frontend pages & routing

Routes are declared in `frontend/src/App.js`. Protected routes wrap in `<ProtectedRoute>` which redirects to `/login` if no auth.

| Path | Page | Purpose |
|---|---|---|
| `/login` | `Login.jsx` | "Continue with Facebook" CTA |
| `/oauth/success` | `OAuthSuccess.jsx` | Lands here after Meta redirect; calls `/auth/me`; routes to onboarding or dashboard |
| `/onboarding` | `Onboarding.jsx` | Connect FB Page + IG account |
| `/` | `Dashboard.jsx` | KPI overview |
| `/pages` | `Pages.jsx` | Connect/disconnect Pages |
| `/campaigns` | **`Campaigns.jsx`** ★ | List & detail. Sync from Meta, configure centre, toggle monitoring per IG post. |
| `/comments` | **`Comments.jsx`** ★ | Auto-reply feed with filters |
| `/approvals` | `Approvals.jsx` | Legacy queue |
| `/leads` | `Leads.jsx` | Detected leads |
| `/kb` | `KnowledgeBase.jsx` | Products / FAQs / policies |
| `/team` | `Team.jsx` | Invites + roles |
| `/analytics` | `Analytics.jsx` | Charts |
| `/audit` | `AuditLogs.jsx` | Audit feed |
| `/settings` | `Settings.jsx` | Brand tone, auto-reply toggle |
| `/invite/:token` | `AcceptInvite.jsx` | Team invite acceptance |

### `lib/api.js`
Axios instance with:
- `baseURL = process.env.REACT_APP_BACKEND_URL + '/api'`
- `withCredentials = true` (for cookies)
- A request interceptor reads the `dashai_csrf` cookie and adds `X-CSRF-Token` on every mutating request.

### `lib/auth.jsx`
`<AuthProvider>` exposes `{user, tenants, activeTenantId, refresh, logout, switchTenant}`. Built on `useQuery('/auth/me')`.

---

## Configuring a campaign (admin UX)

This is the day-to-day flow once OAuth + Page connection is done:

1. Click **Campaigns** in the sidebar.
2. Click **Sync from Meta** (top right). The backend fetches active + paused campaigns from your ad account and upserts them. New campaigns appear with a ⚠️ **Setup required** badge.
3. Click a campaign row to open detail view.
4. **Left panel — Centre Configuration:**
   - `Centre name` — e.g. "Bengaluru – Indiranagar".
   - `Doctor name` — required.
   - `Address` — required.
   - `Phone` — required.
   - `WhatsApp` — optional.
   - `Reply template` — optional textarea. Available variables: `{doctor_name}`, `{center_name}`, `{phone}`, `{address}`, `{whatsapp}`. Tick **Use default template** to clear it and fall back to the system default.
   - The **Live preview** below the form re-renders as you type.
   - **Save configuration** → flips campaign to ✅ **Configured**.
5. **Right panel — Instagram Posts:**
   - Lists every ad under the campaign that has an `instagram_permalink_url`.
   - Each row shows a thumbnail, media type badge (`REEL` / `IMAGE` / `VIDEO`), "View on Instagram →" link, and `X replies sent` counter.
   - Toggle the switch to start/stop monitoring. If you try to enable monitoring before configuring, you get a toast and the API call is blocked.
   - Monitoring active = green pulsing dot.
6. From now on, every new comment on those posts → public reply → row in **Comments** feed.

---

## Testing

### Structural tests — `backend/tests/test_crysta.py`
24 tests, sandbox-safe (all Meta calls stubbed). Run:
```bash
cd backend
python -m pytest tests/test_crysta.py -v
```

Coverage:
- Auth-gating on all 8 IVF routes (401/403 without token)
- Pydantic `CenterConfig` validation (422 on missing required fields)
- All 3 MongoDB indexes are present
- `comment_id` unique index actually blocks duplicate inserts
- Monitor toggle blocked when `is_configured == False`
- Webhook background task: replies, dedups, marks failed on Meta 4xx, skips unmonitored posts
- `/sync` returns 400 with "reconnect Facebook" when `ad_account_id` missing
- `DEFAULT_SCOPES` and the login dialog URL include all 4 required permissions
- `/sync` uses the correct `filtering=[…]` JSON arg
- OAuth callback stores `ad_account_id` (bare, no `act_`)

### Live E2E checklist (do this in production after deploy)
1. Facebook OAuth login (test user must be added to the app's Roles in Development mode).
2. Verify `ad_account_id` set on the tenant: `db.tenants.findOne({owner_user_id: "..."}, {ad_account_id: 1})`.
3. **Sync from Meta** → see real campaigns.
4. Open a campaign → save centre config → ✅ badge.
5. Right panel → toggle monitoring on a boosted IG post.
6. From a **second** account, comment on that IG post.
7. Watch:
   - `db.webhook_events.find().sort({received_at:-1}).limit(1)` — payload arrived.
   - `db.comment_logs.find().sort({replied_at:-1}).limit(1)` — `status: "replied"`.
   - Refresh **Comments** page in the app — row appears.
   - Refresh Instagram — public reply visible.
8. Drop a second comment → confirm reply lands.
9. Repeat the same `comment_id` (via Meta's webhook test tool) → confirm `comment_logs` row count stays the same (dedup).

---

## Deployment

The app is designed for a typical PaaS / container deploy. There is no `Dockerfile` or `render.yaml` checked in — bring your own.

### Recommended target
- **Backend:** any Python 3.11 container with `uvicorn server:app --host 0.0.0.0 --port 8001 --workers 2`. Behind an HTTPS load balancer.
- **Frontend:** static build (`yarn build`) deployed to Vercel / Netlify / S3 + CloudFront / nginx. The build reads `REACT_APP_BACKEND_URL` at compile time, so build per environment.
- **Mongo:** MongoDB Atlas (M0 free tier works for low volume).

### Sample `Dockerfile` (backend)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Sample `render.yaml`
```yaml
services:
  - type: web
    name: ivf-reply-bot-backend
    runtime: python
    region: oregon
    plan: starter
    buildCommand: "pip install -r backend/requirements.txt"
    startCommand: "cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT"
    envVars:
      - key: MONGO_URL
        sync: false
      - key: DB_NAME
        value: dashai
      - key: CORS_ORIGINS
        value: https://app.example.com
      - key: JWT_SECRET
        generateValue: true
      - key: FERNET_KEY
        sync: false           # paste a generated Fernet key
      - key: FB_APP_ID
        sync: false
      - key: FB_APP_SECRET
        sync: false
      - key: FB_REDIRECT_URI
        sync: false
      - key: FB_WEBHOOK_VERIFY_TOKEN
        sync: false
      - key: FB_GRAPH_VERSION
        value: v22.0
      - key: FRONTEND_URL
        value: https://app.example.com

  - type: web
    name: ivf-reply-bot-frontend
    runtime: static
    buildCommand: "cd frontend && yarn install && yarn build"
    staticPublishPath: frontend/build
    envVars:
      - key: REACT_APP_BACKEND_URL
        value: https://api.example.com
```

### Sample `vercel.json` (frontend only)
```json
{
  "buildCommand": "yarn build",
  "outputDirectory": "build",
  "framework": "create-react-app",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "env": {
    "REACT_APP_BACKEND_URL": "@react_app_backend_url"
  }
}
```

### Post-deploy checklist
- [ ] `FB_REDIRECT_URI` matches what's configured in the Meta app **and** the backend's deployed URL exactly (including trailing path).
- [ ] Meta webhook callback URL points to `<backend>/api/webhooks/meta` and is subscribed to `comments`.
- [ ] `CORS_ORIGINS` includes the deployed frontend URL.
- [ ] `FRONTEND_URL` (backend env) matches the deployed frontend URL.
- [ ] HTTPS only — `httpOnly + Secure` cookies will not be set on plain HTTP.
- [ ] If Meta app is in Development mode, every tester is added under Roles.

---

## Operations & debugging

### Logs (Kubernetes / supervisord setup)
```bash
tail -n 200 /var/log/supervisor/backend.err.log
tail -n 200 /var/log/supervisor/backend.out.log
```

### Mongo queries you'll run a lot

```js
// who am I, what tenant, is my ad account set?
db.users.findOne({email: "x@y.com"});
db.tenants.findOne({owner_user_id: "<user-id>"}, {ad_account_id:1, business_name:1});

// what's monitored right now?
db.monitored_posts.find({is_active:true}, {campaign_id:1, instagram_post_id:1, instagram_permalink:1});

// recent webhook deliveries
db.webhook_events.find().sort({received_at:-1}).limit(5).pretty();

// most recent replies
db.comment_logs.find().sort({replied_at:-1}).limit(20).pretty();

// failed replies in last 24h
db.comment_logs.find({
  status: "failed",
  replied_at: {$gte: new Date(Date.now() - 24*3600*1000).toISOString()}
});

// is a specific comment already deduped?
db.comment_logs.findOne({comment_id: "<id-from-webhook>"});
```

### Common errors and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `GET /api/campaigns/sync → 400 "No ad account found. Please reconnect Facebook."` | Tenant has no `ad_account_id`. Either user has no active ad accounts, or the user logged in before the Step 0 fix shipped. | Have user log out and log back in. Verify with the Mongo query above. |
| `POST monitor → 400 "Configure centre first"` | UI shouldn't allow this, but if a user hits the API directly, the gate kicks in. | Save centre config first. |
| Webhook returns `401 "Invalid signature"` | `FB_APP_SECRET` env doesn't match the Meta app secret, or proxy stripped the signature header. | Re-copy app secret from Meta dashboard. Make sure your proxy passes `X-Hub-Signature-256`. |
| Webhook returns `403` on `GET /webhooks/meta` | Wrong verify token. | `FB_WEBHOOK_VERIFY_TOKEN` env must match what you typed in Meta's webhook UI exactly. |
| Replies say "failed" with `(#10) Application does not have permission` | Page is missing required scopes, or the page isn't subscribed. | Reconnect the page in **Pages**. Confirm scopes `pages_manage_engagement` + `instagram_manage_comments` are granted. |
| All requests 403 with `CSRF token missing or invalid` | Frontend didn't set the `dashai_csrf` cookie / `X-CSRF-Token` header. | First request must be a `GET` to prime the cookie. Verify `lib/api.js` interceptor is wired. |
| Cookie not being set after OAuth | Domain mismatch, or non-HTTPS. | Use HTTPS in prod. Confirm `FRONTEND_URL` and `FB_REDIRECT_URI` are on the same eTLD+1 or update SameSite policy. |

### Rotating secrets
- **`JWT_SECRET`**: rotating immediately invalidates all sessions (everyone re-logs).
- **`FERNET_KEY`**: rotating bricks every stored FB token. To rotate safely, decrypt-then-re-encrypt all tokens with the new key as a one-off migration script.
- **`FB_APP_SECRET`**: only rotate from the Meta dashboard; restart backend immediately so HMAC verification keeps working.

---

## Known limitations & roadmap

### Limitations today
- One ad account per tenant (the first ACTIVE one). No UI to switch.
- `BackgroundTasks` not durable — if the backend restarts mid-task, that reply is lost (Meta will not retry beyond the first 200).
- No rate-limit awareness beyond translating Meta's 429 to a 503.
- Comments page filtering doesn't pre-resolve emoji-only comments.
- No DM auto-reply (we only do public comment replies).

### Roadmap
- **P1** — Stripe billing + per-tenant plan limits.
- **P1** — Full Audit Log UI page (collection exists, no page).
- **P1** — Ad-account switcher in workspace settings.
- **P2** — Celery + Redis queue (durable retry, fan-out across pods).
- **P2** — Real-time updates (WebSocket / SSE) on the Comments page.
- **P2** — App Review submission for `pages_manage_engagement` + `instagram_manage_comments`.
- **P2** — Sentry monitoring, CI pipeline, container build.
- **P2** — i18n for the reply templates (Hindi / Marathi / Tamil etc.).

---

## License

Proprietary. © 2026.
