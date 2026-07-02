# MBS Auto-Reply — Multi-tenant Meta Business Suite Auto-Commenting

A production-ready, multi-tenant SaaS that auto-replies to Facebook and Instagram
comments for businesses managed via Meta Business Suite. Built as a Chrome
Extension (MV3) + Next.js backend on Vercel, with Supabase for database/auth and
Claude Haiku for language detection, intent classification, and translation.

## How it works

```
Chrome Extension (control panel)          Vercel Cron (every 5 min)
        │  Start button                           │
        ▼                                         ▼
POST /api/meta/sync  ──────────────►  processOrgComments()
                                              │
                              1. Fetch comments (Meta Graph API)
                              2. Dedup against comments table
                              3. Classify language + intent (Claude Haiku)
                              4. Pick exact ORM reply from Google Sheet rules
                              5. Append translated phone footer
                              6. Post reply (Meta Graph API)
                              7. Record in Supabase → dashboard stats
```

- **Languages**: English, Hindi, Hinglish (primary), Bengali, Marathi
- **Never replies twice** to the same comment — comment IDs are stored per
  tenant with a `UNIQUE(org_id, comment_id)` constraint as the dedup gate.
- **Exact ORM answers** — replies come verbatim from the tenant's Google Sheet;
  only the translated phone footer is appended.
- **Platform separation** — the extension detects whether you're in the
  Facebook or Instagram section of Meta Business Suite and only syncs that
  platform.
- If the extension is opened outside Meta Business Suite, it shows:
  _"Open the Meta Business Suite - You Dumbo :) - By Lucky"_

## Repository layout

```
apps/web/          Next.js 14 (App Router) — dashboard + all API routes
apps/extension/    Chrome Extension MV3 (Vite + CRXJS + React)
packages/types/    Shared TypeScript types
supabase/          SQL migrations (schema, RLS, indexes)
```

## Setup

### 1. Supabase

> **Current status:** the production project `auto-commenter`
> (`obiecguouefiuuhmmqth`, region `ap-south-1`) is already provisioned with all
> four migrations applied, and its URL + anon key are the code defaults in
> `apps/web/src/lib/env.ts` — no Supabase env vars are needed to deploy.
> Remaining dashboard steps: enable Email OTP and set the Site URL (step 3–4).

For a fresh project:

1. Create a project at [supabase.com](https://supabase.com).
2. Apply migrations: `supabase link --project-ref <ref> && supabase db push`
   (or paste the four files in `supabase/migrations/` into the SQL editor in order).
3. Auth → Providers → Email: enable **Email OTP** (magic links) and optionally
   passwords (used by the extension login).
4. Auth → URL Configuration: set Site URL to your Vercel domain and add
   `https://<your-domain>/callback` to redirect URLs.

### 2. Meta App

1. Create an app at [developers.facebook.com](https://developers.facebook.com)
   (type: Business).
2. Add the **Facebook Login for Business** product.
3. Set the OAuth redirect URI to `https://<your-domain>/api/meta/callback`.
4. Request permissions: `pages_show_list`, `pages_read_engagement`,
   `pages_manage_engagement`, `pages_manage_posts`, `instagram_basic`,
   `instagram_manage_comments`, `business_management`.
5. Note the App ID and App Secret.

### 3. Google Sheet (ORM replies)

**No service account needed** if the sheet is shared as
"Anyone with the link" (viewer or commenter) — the sync reads the public CSV
export. `GOOGLE_SERVICE_ACCOUNT_JSON` is only required for private sheets
(share the sheet with the service account's email).

**Sheet layout — two options:**

1. **The documented template** (row 1 header must start with `comment_type`):

   | comment_type | keywords | reply_en | reply_hi | reply_hn | reply_bn | reply_mr |
   |---|---|---|---|---|---|---|
   | price | price, cost, kitna | Our packages start at… | हमारे पैकेज… | Hamare packages… | আমাদের… | आमचे… |
   | general | | Thanks for reaching out! | धन्यवाद! | Thanks! | … | … |

2. **Any other layout** — Claude maps which cells hold which reply
   type/language (it only returns cell coordinates; reply text is used
   verbatim, never paraphrased). This handles real-world ORM sheets with
   mixed columns, notes, and multi-row replies. Missing languages fall back
   to English (the phone footer is still translated).

### 4. Vercel

1. [vercel.com/new](https://vercel.com/new) → Import this repo.
2. Set **Root Directory** to `apps/web` (leave framework/build defaults).
3. Add environment variables (see `.env.example`; Supabase vars are optional —
   real defaults are baked in): `ENCRYPTION_KEY`, `CRON_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and after creating the
   Meta app: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `META_OAUTH_REDIRECT_URI`.
4. Cron jobs in `apps/web/vercel.json` are picked up automatically
   (comment sync every 5 min, sheet sync every 6 h).

### 5. Chrome Extension

```bash
cd apps/extension
VITE_API_URL=https://<your-domain> npm run build
```

Supabase config is fetched from the backend's `/api/config` at runtime, and
the backend URL itself can be changed anytime under **Backend settings** in
the popup's login view — so one build works even if the domain changes.

- **Testing**: chrome://extensions → Developer mode → Load unpacked → `apps/extension/dist`
- **Publishing**: zip `dist/` and upload to the Chrome Web Store Developer Dashboard.

## Local development

```bash
npm install
npm run dev          # turbo: Next.js on :3000 + extension in watch mode
npm test             # vitest unit tests (classification, crypto, sheets, ORM logic)
npm run build        # build everything
```

## Usage flow (per tenant)

1. Sign up on the dashboard → create an organization (set the phone number for
   the reply footer; default `8938935656`).
2. Settings → **Connect Meta** → authorize your Facebook Page (linked Instagram
   Business accounts are connected automatically).
3. ORM Rules → paste your Google Sheet URL → **Save & Sync**.
4. Install the extension, sign in, open Meta Business Suite, hit **Start** —
   or just let the 5-minute cron do the work.
5. Watch the dashboard: comments scanned/answered, breakdown by type and
   language, full reply audit trail.

## Security notes

- Meta access tokens are AES-256-GCM encrypted before touching the database and
  are only decrypted server-side. The extension never sees them.
- Every table has Row Level Security scoped to org membership; the service-role
  key is used only by cron jobs and admin endpoints after explicit membership checks.
- The extension stores only a short-lived Supabase JWT in
  `chrome.storage.session` (cleared when the browser closes).
- Cron endpoints require the `CRON_SECRET` bearer token.

## Roles

| Role | Can do |
|---|---|
| owner | Everything, including deleting the org and granting ownership |
| admin | Manage settings, Meta connections, sheets, team |
| agent | Trigger syncs, manage ORM rules, view everything |
| viewer | Read-only dashboard access |
