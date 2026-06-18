# Phase 1 — Repository Architecture Audit

Audit of the current `claude-code-auto` application prior to migrating it to the
target stack (Next.js 15 / React 19 / TypeScript / Supabase Postgres / Prisma /
Supabase Auth / Cloudflare Workers / Vercel / Sentry / PostHog).

The current app is a **FastAPI (Python) + MongoDB + React 19 (CRA)** multi-tenant
Instagram comment auto-reply SaaS for "Crysta IVF". It lives in `backend/` and
`frontend/`.

---

## 1. Existing architecture

- **Backend:** FastAPI (Python 3.11), single ASGI app (`backend/server.py`),
  all routes under the `/api` prefix. Middleware: `CORSMiddleware` (credentials +
  `CORS_ORIGINS`) and a custom `CSRFMiddleware` (double-submit cookie). Indexes
  ensured on `@app.on_event("startup")`. Fully async (Motor + httpx).
  - `core/`: `db` (Motor client + collection handles + `ensure_indexes`),
    `models` (a handful of Pydantic request models), `deps`
    (`get_current_user` / `get_current_tenant` / `require_role`), `security`
    (JWT + Fernet token crypto), `meta` (Graph API client), `csrf`, `events`
    (audit/notify), `ai` (optional Emergent LLM), `observability` (added:
    structured logging + metrics), `ratelimit`, `sanitize`.
  - `routers/`: `auth, tenant, pages, instagram, comments, approvals, leads,
    kb, team, analytics, webhooks, audit, campaigns, notifications, metrics`.
- **Frontend:** React 19 SPA built with **CRA via craco** (not Next). Routing
  with `react-router-dom` v7, data via **TanStack Query** + **axios**, UI via
  **shadcn/ui** (new-york, JSX) + Tailwind, toasts via **sonner**, icons via
  **@phosphor-icons/react**. Single axios instance (`lib/api.js`) with
  `withCredentials`, `X-Tenant-Id` + `X-CSRF-Token` headers; auth context in
  `lib/auth.jsx`.
- **Tenancy:** multi-tenant by convention — every document carries `tenant_id`
  and every query filters on it (manual isolation, no DB-enforced RLS).

## 2. Existing database schema (MongoDB — schemaless)

Collections (module handle → Mongo name) and key fields:

| Collection | Key fields |
|---|---|
| `users` | `id` (uuid), `fb_user_id`, `name`, `email`, `picture`, `fb_access_token` (Fernet), `created_at` |
| `tenants` | `id`, `business_name`, `owner_user_id`, `onboarded`, `auto_reply_enabled`, `ad_account_id`, `ad_account_synced_at`, brand/support fields, `created_at` |
| `tenant_members` | `user_id`, `tenant_id`, `role` (owner/admin/moderator/viewer), `created_at` |
| `facebook_pages` | `tenant_id`, `page_id`, `name`, `category`, `fan_count`, `picture`, `access_token_enc` (Fernet), `active`, `connected_at` |
| `instagram_accounts` | `tenant_id`, `ig_id`, profile fields, `access_token_enc` |
| `campaigns` | **`_id` = Meta campaign id**, `tenant_id`, `name`, `status`, `objective`, `daily_budget`, `lifetime_budget`, `ad_account_id`, `meta_synced_at`, centre config (`center_name`, `doctor_name`, `address`, `phone`, `whatsapp`, `reply_template`), `is_configured`, `created_at` |
| `monitored_posts` | `tenant_id`, `campaign_id`, `instagram_post_id`, `instagram_permalink`, `is_active`, `activated_at/by`, `created_at` |
| `comment_logs` | `comment_id` (unique), `campaign_id`, `instagram_post_id`, `tenant_id`, `commenter_id`, `comment_text`, `reply_sent`, `status` (replied/failed), `error`, `replied_at` |
| `webhook_events` | `received_at`, `payload` (raw) |
| `audit_logs` | `tenant_id`, `actor_id`, `action`, `target`, `meta`, `at` |
| `notifications` | `tenant_id`, `user_id`, `read`, `created_at`, ... |
| `team_invites` | `token` (unique), `tenant_id`, `email`, `role` |
| `tenant_settings` | declared, effectively unused |
| `oauth_states` | `state`, `expires_at` (TTL) |
| Legacy AI pipeline | `posts`, `comments`, `replies`, `approval_queue`, `leads`, `knowledge_base` |

**Indexes:** uniques on `users.fb_user_id`, `tenant_members(user_id,tenant_id)`,
`facebook_pages(tenant_id,page_id)`, `instagram_accounts(tenant_id,ig_id)`,
`comments(tenant_id,comment_id)`, `comment_logs.comment_id`,
`monitored_posts(instagram_post_id,tenant_id)`; plus secondary indexes on
campaigns/leads/approvals/kb/audit/notifications and a TTL on `oauth_states`.

## 3. Existing API endpoints (all under `/api`)

- **auth:** `GET /auth/facebook/login`, `GET /auth/facebook/callback`,
  `GET /auth/me`, `POST /auth/logout`, `POST /auth/switch/{tenant_id}`.
- **tenant:** `GET /tenant`, `PATCH /tenant`, `POST /tenant/onboard`.
- **pages:** `GET /pages`, `POST /pages/connect/{page_id}`,
  `DELETE /pages/{page_id}`, `POST /pages/{page_id}/sync`.
- **instagram:** `GET /instagram`.
- **campaigns:** `GET /campaigns/sync`, `GET /campaigns/comment-logs`,
  `GET /campaigns`, `GET /campaigns/{id}`, `PATCH /campaigns/{id}/center-config`,
  `GET /campaigns/{id}/posts`, `POST|DELETE /campaigns/{id}/posts/{postId}/monitor`.
- **comments:** `GET /comments` (legacy). **metrics:** `GET /metrics`.
- **webhooks:** `GET /webhooks/meta` (verify), `POST /webhooks/meta` (receive).
- **analytics:** `GET /analytics/overview|sentiment-trend|categories|top-pages`.
- **approvals / leads / kb / team / audit / notifications:** legacy AI-pipeline
  and team/governance CRUD.

## 4. Existing React pages (`frontend/src/pages`)

`Login`, `OAuthSuccess`, `AcceptInvite`, `Onboarding`, `Dashboard`, `Pages`,
`Comments`, `Approvals`, `Leads`, `KnowledgeBase`, `Team`, `Analytics`,
`AuditLogs`, `Campaigns`, `Settings`. Shell + sidebar in `components/AppShell.jsx`,
route guarding in `components/ProtectedRoute.jsx`.

## 5. Existing authentication flow

Facebook-OAuth **only**. `login` builds the Meta dialog URL (state stored in
`oauth_states`); `callback` validates state → exchanges code → long-lived token →
`/me` → fetches first ACTIVE ad account → upserts `users`, creates default
`tenants` + owner `tenant_members` on first login → issues a **JWT in an httpOnly
cookie** (`dashai_token`, HS256, 7d). CSRF via double-submit cookie
(`dashai_csrf` + `X-CSRF-Token`), exempt for `/api/webhooks/meta`. Tenant context
resolved from `X-Tenant-Id` header or the JWT `tid` claim; role via
`require_role`. Tokens encrypted at rest with **Fernet**.

## 6. Existing webhook architecture

`POST /api/webhooks/meta`: reads raw body, verifies `X-Hub-Signature-256` (HMAC
with app secret), persists the raw event to `webhook_events`, schedules a
**FastAPI `BackgroundTask`**, returns `{ok:true}` immediately. The task dedups on
`comment_logs.comment_id`, checks `monitored_posts` (active), loads the campaign
(must be `is_configured`), renders the reply template, POSTs to
`{GRAPH}/{comment_id}/replies` with the first active page token, and writes a
`comment_logs` row (`replied`/`failed`), handling `DuplicateKeyError`.

## 7. Existing background jobs

No external queue/worker. The only async work is **in-process FastAPI
`BackgroundTasks`** (webhook processing). The frontend polls notifications every
30s. There is no Celery/Redis/cron.

## 8. Existing integrations

- **Meta Graph API** (`core/meta.py`, httpx) — OAuth, `/me`, `/me/accounts`,
  `/me/adaccounts`, `act_{id}/campaigns`, `{campaign}/ads`, `{comment}/replies`,
  page webhook subscription, signature verification.
- **Emergent LLM** (`core/ai.py`) — optional DM/idea generation; not needed by
  the auto-reply bot; requires an out-of-band package.
- **Fernet** (cryptography) — token-at-rest encryption.

## 9. Existing environment variables

Backend: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `FERNET_KEY`, `FB_GRAPH_VERSION`,
`FB_APP_ID`, `FB_APP_SECRET`, `FB_REDIRECT_URI`, `FB_WEBHOOK_VERIFY_TOKEN`,
`FRONTEND_URL`, `CORS_ORIGINS`, `EMERGENT_LLM_KEY`, `LOG_FORMAT`, `LOG_LEVEL`,
`SYNC_RATE_LIMIT_SECONDS`. Frontend: `REACT_APP_BACKEND_URL`.

## 10. Existing deployment process

Backend: `uvicorn server:app` from `backend/` (Dockerfile provided). Frontend:
`yarn build` (CRA static bundle). `docker-compose.yml` runs Mongo + backend +
dev frontend. Built originally on an Emergent base image. No CI workflows.

---

## Reuse / Migrate / Remove / Rewrite

| Area | Decision | Notes |
|---|---|---|
| Domain model (tenant → campaign → centre → monitored post → comment log) | **Migrate** | Re-modelled in Postgres/Prisma with FKs + RLS. |
| Meta Graph client logic | **Reuse → port to TS** | `lib/meta` in `apps/web` + reused by workers. |
| Reply template render + sanitisation | **Reuse → port to TS** | `lib/templates` with safe rendering + allow-listed placeholders. |
| Dedup + rate-limit + RBAC + tenant isolation | **Reuse (concepts)** | Dedup via unique `comment_logs.comment_id`; RLS enforces isolation; roles expanded to Owner/Admin/Manager/Agent/Viewer. |
| React pages (Campaigns, Comments, Dashboard, Login) UX | **Migrate → TSX** | Re-implemented as Next App Router pages with shadcn/ui + TanStack Query. |
| Design tokens (Klein Blue `#002FA7`, Chivo/IBM Plex, sharp radius) | **Reuse** | Ported into the Tailwind theme + CSS variables, plus dark mode. |
| shadcn/ui primitives | **Migrate** | Regenerated as `.tsx` in the new app. |
| MongoDB + Motor | **Remove** | Replaced by Supabase Postgres + Prisma. |
| FastAPI app + routers | **Rewrite** | Next.js Route Handlers + Server Actions. |
| JWT-cookie auth + CSRF double-submit | **Rewrite** | Supabase Auth (Facebook provider) + SSR session cookies. |
| Fernet token crypto | **Rewrite** | Tokens stored server-side only (service-role), never sent to the client; column encryption via pgcrypto/Vault optional. |
| Webhook in-process BackgroundTasks | **Rewrite** | Cloudflare `webhook-worker` (ingest + 200) → Queue → `queue-worker` (process + reply). |
| Legacy AI pipeline (`posts`, `comments`(old), `replies`, `approval_queue`, `leads`, `knowledge_base`, Emergent LLM) | **Remove** | Out of scope for the IG automation product; not carried over. |
| `notifications`, `settings`, `notification_preferences`, `api_logs` | **Implement** | Required by the target spec; added to the new schema. |

**Reusable as-is:** none of the Python runtime (stack change), but the *business
logic and UX* are well-specified and directly portable. **Highest-risk rewrites:**
Supabase Auth (FB provider + token capture) and the Cloudflare webhook/queue
pipeline — addressed explicitly in the migration plan.
