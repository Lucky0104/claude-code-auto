-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_sheets_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE orm_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;

-- ─── Helper: org IDs the current user belongs to ─────────────────────────────
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
$$;

-- ─── Helper: role of the current user in a given org ─────────────────────────
CREATE OR REPLACE FUNCTION user_role_in_org(check_org_id UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_organizations
  WHERE user_id = auth.uid() AND org_id = check_org_id
$$;

-- ─── organizations: members can read; owners/admins can update ───────────────
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id IN (SELECT user_org_ids()));

CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (user_role_in_org(id) IN ('owner','admin'));

CREATE POLICY "org_delete" ON organizations
  FOR DELETE USING (user_role_in_org(id) = 'owner');

-- ─── user_organizations: read own memberships + memberships of shared orgs ───
CREATE POLICY "membership_select" ON user_organizations
  FOR SELECT USING (
    user_id = auth.uid() OR org_id IN (SELECT user_org_ids())
  );

CREATE POLICY "membership_insert" ON user_organizations
  FOR INSERT WITH CHECK (
    -- Bootstrap: creating own owner membership, or admins adding members
    (user_id = auth.uid() AND role = 'owner')
    OR user_role_in_org(org_id) IN ('owner','admin')
  );

CREATE POLICY "membership_update" ON user_organizations
  FOR UPDATE USING (user_role_in_org(org_id) IN ('owner','admin'));

CREATE POLICY "membership_delete" ON user_organizations
  FOR DELETE USING (
    user_id = auth.uid() OR user_role_in_org(org_id) IN ('owner','admin')
  );

-- ─── meta_connections: members read; owners/admins write ─────────────────────
CREATE POLICY "meta_select" ON meta_connections
  FOR SELECT USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY "meta_write" ON meta_connections
  FOR ALL USING (user_role_in_org(org_id) IN ('owner','admin'));

-- ─── google_sheets_config: members read; owners/admins write ─────────────────
CREATE POLICY "sheets_select" ON google_sheets_config
  FOR SELECT USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY "sheets_write" ON google_sheets_config
  FOR ALL USING (user_role_in_org(org_id) IN ('owner','admin'));

-- ─── orm_rules: members read; owners/admins/agents write ─────────────────────
CREATE POLICY "rules_select" ON orm_rules
  FOR SELECT USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY "rules_write" ON orm_rules
  FOR ALL USING (user_role_in_org(org_id) IN ('owner','admin','agent'));

-- ─── comments: members read; owners/admins/agents write ──────────────────────
CREATE POLICY "comments_select" ON comments
  FOR SELECT USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY "comments_write" ON comments
  FOR ALL USING (user_role_in_org(org_id) IN ('owner','admin','agent'));

-- ─── replies: members read; owners/admins/agents write ───────────────────────
CREATE POLICY "replies_select" ON replies
  FOR SELECT USING (org_id IN (SELECT user_org_ids()));

CREATE POLICY "replies_write" ON replies
  FOR ALL USING (user_role_in_org(org_id) IN ('owner','admin','agent'));
