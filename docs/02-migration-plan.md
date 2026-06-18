# Phase 2 — Target Architecture & Migration Plan

Target stack: **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind ·
shadcn/ui · TanStack Query · Supabase Postgres · Prisma · Supabase Auth ·
Cloudflare Workers · Vercel · Sentry · PostHog.**

The new system is built as a monorepo at the repository root. The legacy
`backend/` and `frontend/` are **kept (superseded, not deleted)** so nothing is
lost; they can be removed once the new app is verified in your environment.

## Folder structure

```
apps/web                     # Next.js 15 app (UI + Route Handlers + Server Actions)
  app/                       # App Router (route groups: (auth), (dashboard))
  components/                # shared UI + shadcn/ui primitives (ui/)
  features/                  # feature modules (campaigns, comments, dashboard, pages, team)
  lib/                       # env, supabase clients, prisma, meta, templates, rbac, rate-limit
  hooks/                     # React hooks (TanStack Query hooks)
  providers/                 # client providers (Query, Theme, PostHog)
  actions/                   # Server Actions
  api/                       # (route handlers live under app/api; this holds shared api helpers)
  types/                     # shared TS types
supabase
  migrations/                # SQL: schema
  policies/                  # SQL: RLS policies
  seed/                      # SQL: seed data
workers
  webhook-worker/            # Cloudflare Worker: verify + 200 + enqueue
  queue-worker/              # Cloudflare Worker: consume queue + post reply + log
prisma
  schema.prisma              # Prisma schema (source of truth for the app's typed DB access)
  migrations/                # Prisma migrations (generated via `prisma migrate`)
```

## Data model mapping (Mongo → Postgres)

| Mongo collection | Postgres table | Notes |
|---|---|---|
| `tenants` | `tenants` (org) | adds `slug`, timestamps |
| `users` | `users` | mirrors `auth.users` (FK `auth_user_id`) |
| `tenant_members` | `team_members` | role enum Owner/Admin/Manager/Agent/Viewer |
| `facebook_pages` | `facebook_pages` | `is_active`, token server-only |
| `tenants.ad_account_id` | `ad_accounts` | promoted to its own table (multiple + switch) |
| `campaigns` | `campaigns` | `meta_campaign_id` unique per tenant; centre cols |
| (centre fields on campaign) | (same `campaigns` row) | `is_configured` |
| `monitored_posts` | `monitored_posts` | unique `(tenant_id, instagram_post_id)` |
| `comment_logs` | `comment_logs` | unique `comment_id`; status enum |
| `webhook_events` | `webhook_events` | raw payload + dedup hash + processing status |
| `audit_logs` | `audit_logs` | |
| `notifications` | `notifications` + `notification_preferences` | |
| `tenant_settings` | `settings` | per-tenant key/value + typed columns |
| (new) | `api_logs` | outbound Meta API call logging |

Every table includes `id uuid default gen_random_uuid()`, `created_at`,
`updated_at` (trigger-maintained), and (tenant-scoped tables) `tenant_id`.

## Multi-tenancy & RLS strategy

- Every tenant-scoped table has `tenant_id uuid references tenants(id)`.
- Membership is the source of truth: `team_members(user_id, tenant_id, role)`.
- A SQL helper `auth.user_tenant_ids()` returns the caller's tenant ids; RLS
  `USING (tenant_id IN (select auth.user_tenant_ids()))` enforces read isolation;
  writes additionally check role via `auth.has_role(tenant_id, variadic roles)`.
- The browser uses the **anon** key (RLS-enforced). Server Actions/Route Handlers
  use the **service-role** key only after validating the session + tenant + role
  in app code (defence in depth). Workers use the service-role key.

## Auth migration (Supabase Auth)

- Supabase Auth with the **Facebook provider** handles login/session (SSR cookies
  via `@supabase/ssr`). On `SIGNED_IN`, the provider token + Facebook user id are
  captured server-side and exchanged for a long-lived token; pages/ad-accounts are
  synced. Tokens are stored in server-only tables and **never** returned to the
  browser. A first-login bootstrap creates the user's default tenant + Owner
  membership (DB trigger + server action).

## Webhook pipeline (Cloudflare)

```
Meta → webhook-worker (verify signature, dedup, store raw, enqueue) → 200 OK
                                   │
                                   ▼
                       Cloudflare Queue
                                   │
                                   ▼
       queue-worker (load monitored post + campaign → render reply →
                     POST /{comment_id}/replies → write comment_log,
                     retries + Meta-429 backoff + dead-letter)
```

The Next.js app also exposes `POST /api/webhooks/meta` as a **fallback/verify**
endpoint so the system works even before Workers are deployed.

## Phased execution

1. **Foundation (this PR):** monorepo config, Prisma schema, Supabase SQL
   (tables + RLS + seed), env contracts, shared `lib` (env, supabase, prisma,
   meta, templates, rbac, rate-limit), Cloudflare workers, observability wiring,
   deployment docs, and unit tests for pure logic.
2. **App surface:** Next.js providers + shadcn/ui + auth pages + dashboard +
   campaigns (list/detail/centre config) + comments feed + pages/ad-accounts +
   route handlers + server actions + TanStack Query hooks.
3. **Hardening:** integration/API/webhook tests, Sentry/PostHog event coverage,
   CI, and parity verification, then optional removal of the legacy app.

## Deployment targets

- **Vercel:** hosts `apps/web` (build `next build`; root set to `apps/web` or via
  monorepo config). Env from `apps/web/.env.example`.
- **Supabase:** apply `supabase/migrations` + `supabase/policies` + seed; enable
  the Facebook auth provider.
- **Cloudflare:** `wrangler deploy` each worker; bind the Queue + secrets.
- **Sentry/PostHog:** DSN/keys via env; initialised in app + workers.

See `docs/03-deployment.md` for step-by-step instructions.
