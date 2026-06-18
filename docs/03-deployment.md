# Phase 3 — Setup & Deployment

Targets: **Vercel** (Next.js app) · **Supabase** (Postgres + Auth) · **Cloudflare
Workers** (webhook + queue) · **Sentry** + **PostHog** (observability).

## 0. Prerequisites

- Node 20+, npm 10+
- A Supabase project, a Meta (Facebook) app, a Cloudflare account
- (optional) Sentry + PostHog projects

## 1. Install

```bash
npm install                 # installs apps/web + workers (root prisma generate runs)
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

## 2. Supabase

1. Create a project; copy the URL + anon key + service-role key + DB connection
   strings into `apps/web/.env.local` and `.env`.
2. Provision the database (choose ONE table-creation path):
   - **Prisma:** `npm run db:deploy` (applies `prisma/migrations`), or
   - **Supabase SQL:** run `supabase/migrations/0001_init.sql`.
3. Apply the Supabase layer (always, on top): run, in order,
   `supabase/migrations/0002_functions_triggers.sql`, then
   `supabase/policies/0003_rls.sql`. Optionally `supabase/seed/seed.sql`.
   - With the Supabase CLI: `supabase db push` then run the policies/seed files,
     or paste each file into the SQL editor.
4. **Auth → Providers → Facebook:** enable it, set the Meta App ID/Secret, and add
   the callback `https://<your-app>/auth/callback` (and
   `http://localhost:3000/auth/callback` for dev) to the provider's redirect list
   and to the Meta app's Valid OAuth Redirect URIs.

## 3. Meta app

- Add products: Facebook Login, Instagram, Webhooks.
- Permissions/scopes (requested at login): `pages_show_list`, `business_management`,
  `ads_read`, `pages_read_engagement`, `pages_manage_engagement`,
  `instagram_manage_comments`.
- Webhooks → Instagram → callback URL = your **Cloudflare webhook-worker** URL
  (or `https://<your-app>/api/webhooks/meta` as a fallback), verify token =
  `FB_WEBHOOK_VERIFY_TOKEN`; subscribe to the `comments` field.

## 4. Vercel (app)

1. Import the repo. Set the project **Root Directory** to `apps/web`.
2. Build command: `npm run build` (runs `prisma generate` then `next build`).
   Install command: `npm install` (run at the repo root so workspaces resolve —
   on Vercel set "Include files outside the root directory" / use the monorepo
   setting, or set Root Directory to the repo root with output `apps/web`).
3. Add all variables from `apps/web/.env.example` (Production + Preview). Ensure
   `DATABASE_URL` uses the **pooled** (PgBouncer, port 6543) connection and
   `DIRECT_URL` the direct (5432) connection.

## 5. Cloudflare Workers

Create the queues, then deploy both workers:

```bash
npx wrangler queues create crysta-comments
npx wrangler queues create crysta-comments-dlq

cd workers/webhook-worker
# set SUPABASE_URL in wrangler.toml [vars]; then:
npx wrangler secret put FB_APP_SECRET
npx wrangler secret put FB_WEBHOOK_VERIFY_TOKEN
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy

cd ../queue-worker
# set SUPABASE_URL + FB_GRAPH_VERSION in wrangler.toml [vars]; then:
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

Point the Meta webhook callback at the deployed `webhook-worker` URL. (Cloudflare
Queues require the Workers Paid plan. Without it, use the Next.js fallback route
`/api/webhooks/meta`, which processes inline via `after()`.)

## 6. Observability

- **Sentry:** set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client).
  Server init is in `instrumentation.ts`; client errors flow via `global-error.tsx`.
- **PostHog:** set `NEXT_PUBLIC_POSTHOG_KEY` (+ host). Client init is in the
  providers; server events via `trackServer()`.

## 7. Local development

```bash
# DB
npm run db:deploy           # or apply supabase/* SQL to a local/remote Postgres
# App
npm run dev                 # http://localhost:3000
# Workers (separate terminals)
cd workers/webhook-worker && npm run dev
cd workers/queue-worker  && npm run dev
# Tests
npm run test --workspace apps/web
```

## 8. Tests

```bash
npm run test --workspace apps/web    # vitest: templates, rbac, rate-limit, meta signature, component
npm run typecheck --workspace apps/web
cd workers/webhook-worker && npm run typecheck
cd workers/queue-worker  && npm run typecheck
```

## Env var reference

See `apps/web/.env.example` (app), `.env.example` (root/Prisma), and
`workers/*/.dev.vars.example` (workers).
