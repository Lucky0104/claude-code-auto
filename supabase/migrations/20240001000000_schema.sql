-- ─── Organizations (tenants) ────────────────────────────────────────────────
CREATE TABLE organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL DEFAULT '8938935656',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── User ↔ Organization membership with roles ──────────────────────────────
CREATE TABLE user_organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner','admin','agent','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- ─── Meta (Facebook/Instagram) page connections per org ─────────────────────
CREATE TABLE meta_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  page_id          TEXT NOT NULL,
  page_name        TEXT,
  access_token     TEXT NOT NULL, -- AES-256-GCM encrypted at the app layer
  token_expires_at TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, platform, page_id)
);

-- ─── Google Sheet config per org ─────────────────────────────────────────────
CREATE TABLE google_sheets_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  sheet_id       TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ORM reply rules (synced from Google Sheet) ──────────────────────────────
CREATE TABLE orm_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  comment_type TEXT NOT NULL,
  keywords     TEXT[] NOT NULL DEFAULT '{}',
  reply_en     TEXT,
  reply_hi     TEXT,
  reply_hn     TEXT,
  reply_bn     TEXT,
  reply_mr     TEXT,
  priority     INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, comment_type)
);

-- ─── Comments (scanned from Meta; dedup ledger) ──────────────────────────────
CREATE TABLE comments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meta_connection_id UUID REFERENCES meta_connections(id) ON DELETE SET NULL,
  comment_id         TEXT NOT NULL,
  post_id            TEXT NOT NULL,
  platform           TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  comment_text       TEXT NOT NULL,
  commenter_name     TEXT,
  commenter_id       TEXT,
  detected_language  TEXT CHECK (detected_language IN ('en','hi','hn','bn','mr')),
  comment_type       TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','replied','skipped','failed')),
  error_message      TEXT,
  replied_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, comment_id)
);

-- ─── Replies posted ───────────────────────────────────────────────────────────
CREATE TABLE replies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  comment_id    UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reply_text    TEXT NOT NULL,
  meta_reply_id TEXT,
  language      TEXT NOT NULL CHECK (language IN ('en','hi','hn','bn','mr')),
  orm_rule_id   UUID REFERENCES orm_rules(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
