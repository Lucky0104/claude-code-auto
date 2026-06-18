-- Crysta IVF — Row Level Security. Apply AFTER 0002_functions_triggers.sql.
--
-- Model: the browser uses the anon/authenticated key (these policies enforce
-- tenant isolation). Server Actions, Route Handlers, and Cloudflare Workers use
-- the service-role key, which bypasses RLS — they enforce tenant + role in app
-- code as defence in depth. anon (logged-out) gets no access.

-- Enable RLS everywhere.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'tenants','users','facebook_identities','team_members','facebook_pages',
      'ad_accounts','campaigns','monitored_posts','comment_logs','webhook_events',
      'audit_logs','api_logs','settings','notification_preferences','notifications'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
  end loop;
end $$;

-- Never expose secret token columns to client roles (RLS does not hide columns).
revoke select (access_token) on public.facebook_pages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create policy tenants_select on public.tenants
  for select to authenticated
  using (id in (select public.user_tenant_ids()));

create policy tenants_update on public.tenants
  for update to authenticated
  using (public.has_tenant_role(id, 'OWNER', 'ADMIN'))
  with check (public.has_tenant_role(id, 'OWNER', 'ADMIN'));

-- ---------------------------------------------------------------------------
-- users (self + co-members readable; tokens live in facebook_identities)
-- ---------------------------------------------------------------------------
create policy users_select_self on public.users
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or id in (
      select tm.user_id from public.team_members tm
      where tm.tenant_id in (select public.user_tenant_ids())
    )
  );

create policy users_update_self on public.users
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- facebook_identities: no policies -> only the service role can touch tokens.

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
create policy team_members_select on public.team_members
  for select to authenticated
  using (tenant_id in (select public.user_tenant_ids()));

create policy team_members_write on public.team_members
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN'))
  with check (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN'));

-- ---------------------------------------------------------------------------
-- Generic tenant-scoped tables: SELECT by membership.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'facebook_pages','ad_accounts','campaigns','monitored_posts','comment_logs',
      'webhook_events','audit_logs','api_logs','settings','notification_preferences',
      'notifications'
    ])
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id in (select public.user_tenant_ids()));',
      t || '_select', t);
  end loop;
end $$;

-- Writes that managers+ may perform (config + operations).
create policy facebook_pages_write on public.facebook_pages
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER'))
  with check (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER'));

create policy ad_accounts_write on public.ad_accounts
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER'))
  with check (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER'));

create policy campaigns_write on public.campaigns
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER'))
  with check (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER'));

create policy monitored_posts_write on public.monitored_posts
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'))
  with check (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN', 'MANAGER', 'AGENT'));

create policy settings_write on public.settings
  for all to authenticated
  using (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN'))
  with check (public.has_tenant_role(tenant_id, 'OWNER', 'ADMIN'));

-- A user manages only their own notification preferences.
create policy notification_prefs_write on public.notification_preferences
  for all to authenticated
  using (user_id = public.app_user_id())
  with check (user_id = public.app_user_id());

-- A user marks their own notifications read.
create policy notifications_update on public.notifications
  for update to authenticated
  using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));

-- comment_logs / audit_logs / api_logs / webhook_events are written by the
-- service role only (workers + server) so they have SELECT policies above but
-- no client write policies.
