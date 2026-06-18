-- Crysta IVF — Supabase-layer objects (apply AFTER tables exist, via either
-- prisma migrate deploy or supabase/migrations/0001_init.sql).

-- Required extension for gen_random_uuid() (Supabase enables this by default).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- updated_at maintenance (so non-Prisma writers — supabase-js, workers, raw
-- SQL — also get fresh updated_at).
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Link app users to Supabase auth.users.
-- ---------------------------------------------------------------------------
alter table public.users drop constraint if exists users_auth_user_id_fkey;
alter table public.users
  add constraint users_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete cascade;

-- Create a public.users row automatically when a new auth user signs in.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (auth_user_id, email, full_name, avatar_url, facebook_user_id)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'provider_id'
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Tenancy helpers (security definer so RLS policies can call them without
-- recursing through the very tables they protect).
-- ---------------------------------------------------------------------------
create or replace function public.app_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid()
$$;

create or replace function public.user_tenant_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select tm.tenant_id
  from public.team_members tm
  join public.users u on u.id = tm.user_id
  where u.auth_user_id = auth.uid()
$$;

create or replace function public.has_tenant_role(p_tenant uuid, variadic p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.team_members tm
    join public.users u on u.id = tm.user_id
    where u.auth_user_id = auth.uid()
      and tm.tenant_id = p_tenant
      and tm.role::text = any (p_roles)
  )
$$;

grant execute on function public.app_user_id() to authenticated;
grant execute on function public.user_tenant_ids() to authenticated;
grant execute on function public.has_tenant_role(uuid, text[]) to authenticated;
