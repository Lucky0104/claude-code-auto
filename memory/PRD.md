# DashAI / Crysta IVF Auto-Comment Bot — PRD

## Original Problem Statement
Crysta IVF runs a Facebook Ad campaign per city centre. Each campaign maps
to one doctor + one clinic. When a user comments on the Instagram post
boosted by that campaign, the bot must post a PUBLIC reply containing the
centre's doctor name, address, phone.

All data is real: real Facebook OAuth, real Meta Graph API, real ad
account, real boosted posts. No mocks, no seed data, no hardcoded IDs.

## Architecture (current)
- Backend: FastAPI + Motor (MongoDB) + httpx, Fernet-encrypted tokens, JWT
  + cookie auth, CSRF double-submit, X-Hub-Signature-256 verified webhooks.
- Frontend: React 19 + TanStack Query + Axios + shadcn/ui.
- Multi-tenant — every collection keyed by `tenant_id`.

## Crysta IVF feature (Feb 2026)
**Touches 7 files** (the 5 spec deliverables + auth.py + meta.py for OAuth scopes + ad_account_id).

### Implemented
1. **OAuth callback** (`backend/routers/auth.py`)
   - Scope expanded to include `ads_read`, `pages_read_engagement`,
     `pages_manage_engagement`, `instagram_manage_comments`.
   - After login, calls `/me/adaccounts`, picks the first
     `account_status == 1` (ACTIVE) account, stores its bare numeric id
     (no `act_` prefix) on `tenants.ad_account_id`.
   - Both new-tenant and returning-tenant paths refresh `ad_account_id`.

2. **Meta helper** (`backend/core/meta.py`)
   - `DEFAULT_SCOPES` updated.
   - New `get_user_adaccounts(token)` helper.

3. **Campaigns router** (`backend/routers/campaigns.py`)
   - `GET /api/campaigns/sync` — uses tenant's `ad_account_id`, calls
     `/act_{id}/campaigns?filtering=[…effective_status IN ACTIVE,PAUSED]`,
     upserts into `campaigns` collection with default centre-config
     fields `null` and `is_configured: false`. 429 → 503, other errors
     → 502 with Meta message.
   - `GET /api/campaigns` — list, includes `monitored_posts_count`.
   - `GET /api/campaigns/{id}` — single doc.
   - `PATCH /api/campaigns/{id}/center-config` — saves doctor/address/
     phone/whatsapp/template, sets `is_configured: true`.
   - `GET /api/campaigns/{id}/posts` — fetches ads + Instagram permalinks,
     joins with `monitored_posts` and `comment_logs` for counts.
   - `POST/DELETE /api/campaigns/{id}/posts/{post_id}/monitor` — toggle;
     blocks POST with 400 if `is_configured` is false.
   - `GET /api/campaigns/comment-logs` — feed with filters
     (`campaign_id`, `center_name`, `status`, `date_from`, `date_to`,
     `q`). Joins campaign name + centre name for display.

4. **Webhooks router** (`backend/routers/webhooks.py`)
   - Returns 200 immediately, processes via `BackgroundTasks`.
   - For each comment: dedup (`comment_logs.comment_id` unique),
     check `monitored_posts.is_active`, load campaign, build reply from
     `reply_template` or default, POST to
     `/{comment_id}/replies` via httpx (10s timeout), insert
     `comment_logs` (status `replied` / `failed`).

5. **DB indexes** (`backend/core/db.py`)
   - `comment_logs.comment_id` unique
   - `monitored_posts.{instagram_post_id, tenant_id}` unique compound
   - `campaigns.{tenant_id, meta_synced_at}` compound

6. **Campaigns UI** (`frontend/src/pages/Campaigns.jsx`)
   - List view: sync button, status pills, INR budgets, ✅/⚠️ setup
     indicator, monitored-post count.
   - Detail view: 2-panel — centre configuration form (with live preview)
     + Instagram posts list (monitor switch, replies-sent count).
   - Monitoring switch blocks with toast if campaign not configured.

7. **Comments UI** (`frontend/src/pages/Comments.jsx`)
   - Feed sourced from `/api/campaigns/comment-logs`.
   - Filters bar: campaign, centre, status, date range, search.
   - Per-row: quote block of original comment + brand-colored reply block,
     status badge, relative timestamp, "View post" link.

## Tests
- `/app/backend/tests/test_crysta.py` — **24 structural tests, all pass**:
  auth-protection, Pydantic validation, indexes, dedup,
  monitor-gate, webhook background task (replied/failed/dedup/skipped),
  sync ad_account requirement, OAuth scopes, sync upsert with stubbed
  Meta, callback ad_account_id persistence.

## Live testing (deferred to user — outside sandbox)
- Live Facebook OAuth login storing `ad_account_id`.
- `GET /api/campaigns/sync` against real Ads Manager.
- `GET /api/campaigns/{id}/posts` returning real boosted posts.
- Webhook auto-reply with real Instagram comment.

## Known intentional regressions (legacy AI-campaign-suggestion feature)
The previous version of `campaigns.py` had `POST /campaigns/generate`
(Claude-generated campaign ideas) and `DELETE /campaigns/{id}`. The
Crysta IVF spec replaced campaigns.py wholesale — these endpoints are
removed. Two legacy tests in `tests/backend_test.py` and one expecting
`instagram_basic` scope now fail; this is expected per spec.

## Backlog (P1/P2)
- P1: Stripe billing / subscription plans
- P1: Audit Log UI (collection exists, no page)
- P2: WebSocket realtime feed
- P2: Move OAuth state to Redis
- P2: Celery + Redis queue for webhook fan-out
- P2: App Review / production Meta app permissions
