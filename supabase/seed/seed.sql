-- Crysta IVF — seed data for local development.
-- Idempotent: re-runnable. Uses fixed UUIDs so rows cross-reference cleanly.
-- Membership requires a real auth user, so after logging in once (which creates
-- your public.users row) attach yourself to the demo tenant — see bottom.

-- Demo tenant + settings -----------------------------------------------------
insert into public.tenants (id, name, slug)
values ('00000000-0000-0000-0000-0000000000aa', 'Crysta IVF (Demo)', 'crysta-demo')
on conflict (slug) do nothing;

insert into public.settings (tenant_id, auto_reply_enabled, timezone, default_reply_template)
values (
  '00000000-0000-0000-0000-0000000000aa', true, 'Asia/Kolkata',
  'Thank you for reaching out to {center_name}. Dr. {doctor_name} and our fertility experts would be happy to assist you. Contact us at {phone} or visit us at {address}.'
)
on conflict (tenant_id) do nothing;

-- Demo ad account ------------------------------------------------------------
insert into public.ad_accounts (tenant_id, ad_account_id, name, account_status, is_active)
values ('00000000-0000-0000-0000-0000000000aa', '999999999999', 'Crysta Ads', 1, true)
on conflict (tenant_id, ad_account_id) do nothing;

-- Demo campaigns (one configured, one not) -----------------------------------
insert into public.campaigns (
  id, tenant_id, meta_campaign_id, ad_account_id, name, status, objective,
  daily_budget, center_name, doctor_name, address, phone, whatsapp,
  reply_template, is_configured, meta_synced_at
) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000aa',
   '23850000000000001', '999999999999', 'Bengaluru — IVF Awareness', 'ACTIVE', 'LINK_CLICKS',
   '50000', 'Bengaluru', 'Dr. Asha Rao', '100 MG Road, Bengaluru', '+91 99000 11000', '+91 99000 11000',
   null, true, now()),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000aa',
   '23850000000000002', '999999999999', 'Hyderabad — Fertility', 'PAUSED', 'MESSAGES',
   '40000', null, null, null, null, null, null, false, now())
on conflict (tenant_id, meta_campaign_id) do nothing;

-- Demo monitored post --------------------------------------------------------
insert into public.monitored_posts (
  id, tenant_id, campaign_id, instagram_post_id, instagram_permalink, media_type, is_active, activated_at
) values (
  '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000b1', 'Cdemopost001',
  'https://www.instagram.com/p/Cdemopost001/', 'IMAGE', true, now()
)
on conflict (tenant_id, instagram_post_id) do nothing;

-- Demo comment logs ----------------------------------------------------------
insert into public.comment_logs (
  tenant_id, campaign_id, comment_id, instagram_post_id, commenter_id, commenter_name,
  comment_text, reply_text, status, reply_sent, replied_at
) values
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000b1',
   'demo-comment-1', 'Cdemopost001', 'iguser_1', 'Priya',
   'How much does IVF cost?',
   'Thank you for reaching out to Bengaluru. Dr. Asha Rao and our fertility experts would be happy to assist you. Contact us at +91 99000 11000.',
   'REPLIED', true, now()),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000b1',
   'demo-comment-2', 'Cdemopost001', 'iguser_2', 'Rahul',
   'Do you have EMI options?', null, 'FAILED', false, now())
on conflict (comment_id) do nothing;

-- ---------------------------------------------------------------------------
-- After your first login, link your user to the demo tenant as OWNER so the
-- dashboard shows the seed data. Replace the email if needed:
--
--   insert into public.team_members (tenant_id, user_id, role)
--   select '00000000-0000-0000-0000-0000000000aa', u.id, 'OWNER'
--   from public.users u where u.email = 'you@example.com'
--   on conflict (tenant_id, user_id) do nothing;
-- ---------------------------------------------------------------------------
