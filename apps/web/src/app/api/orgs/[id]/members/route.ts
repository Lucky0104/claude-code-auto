import { NextResponse } from 'next/server';
import { getAuthenticatedClient, createSupabaseServiceClient } from '@/lib/supabase/server';

type Params = { params: { id: string } };

const VALID_ROLES = ['owner', 'admin', 'agent', 'viewer'];

async function requireMembership(req: Request, orgId: string) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return { user: null, role: null };

  const { data } = await supabase
    .from('user_organizations')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .single();

  return { user, role: data?.role ?? null };
}

/** GET /api/orgs/:id/members — list members with emails. */
export async function GET(req: Request, { params }: Params) {
  const { user, role } = await requireMembership(req, params.id);
  if (!user || !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createSupabaseServiceClient();
  const { data: memberships, error } = await service
    .from('user_organizations')
    .select('id, user_id, role, created_at')
    .eq('org_id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = [];
  for (const m of memberships ?? []) {
    const { data } = await service.auth.admin.getUserById(m.user_id);
    members.push({
      id: m.id,
      user_id: m.user_id,
      email: data.user?.email ?? 'unknown',
      role: m.role,
      created_at: m.created_at,
    });
  }

  return NextResponse.json({ members });
}

/** POST /api/orgs/:id/members — invite a user by email (owner/admin only). */
export async function POST(req: Request, { params }: Params) {
  const { user, role } = await requireMembership(req, params.id);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!role || !['owner', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const newRole = body.role ?? 'agent';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(newRole) || newRole === 'owner') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  // Invite (creates the user if they don't exist and emails them a link)
  const { data: invited, error: inviteError } =
    await service.auth.admin.inviteUserByEmail(email);

  let invitedUserId = invited?.user?.id;
  if (inviteError) {
    // Already registered — look them up
    const { data: list } = await service.auth.admin.listUsers();
    invitedUserId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!invitedUserId) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
  }

  const { error: memberError } = await service.from('user_organizations').upsert(
    { user_id: invitedUserId, org_id: params.id, role: newRole },
    { onConflict: 'user_id,org_id' }
  );

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** PATCH /api/orgs/:id/members — change a member's role (owner/admin only). */
export async function PATCH(req: Request, { params }: Params) {
  const { user, role } = await requireMembership(req, params.id);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!role || !['owner', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { user_id?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.user_id || !body.role || !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: 'user_id and valid role are required' }, { status: 400 });
  }
  if (body.role === 'owner' && role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can grant ownership' }, { status: 403 });
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('user_organizations')
    .update({ role: body.role })
    .eq('org_id', params.id)
    .eq('user_id', body.user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/orgs/:id/members?user_id=... — remove a member (owner/admin only). */
export async function DELETE(req: Request, { params }: Params) {
  const { user, role } = await requireMembership(req, params.id);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!role || !['owner', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetUserId = new URL(req.url).searchParams.get('user_id');
  if (!targetUserId) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  // Never remove the last owner
  const { data: target } = await service
    .from('user_organizations')
    .select('role')
    .eq('org_id', params.id)
    .eq('user_id', targetUserId)
    .single();

  if (target?.role === 'owner') {
    const { count } = await service
      .from('user_organizations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', params.id)
      .eq('role', 'owner');
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last owner' }, { status: 400 });
    }
  }

  const { error } = await service
    .from('user_organizations')
    .delete()
    .eq('org_id', params.id)
    .eq('user_id', targetUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
