import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';

/** GET /api/orgs — list orgs the current user belongs to. */
export async function GET(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_organizations')
    .select('role, organizations(*)')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orgs = (data ?? []).map((row) => ({
    ...(row.organizations as unknown as Record<string, unknown>),
    role: row.role,
  }));
  return NextResponse.json({ organizations: orgs });
}

/** POST /api/orgs — create an org; caller becomes owner. */
export async function POST(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; phone_number?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length > 120) {
    return NextResponse.json({ error: 'name is required (max 120 chars)' }, { status: 400 });
  }

  const phone = body.phone_number?.trim() || '8938935656';
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) +
    '-' +
    Math.random().toString(36).slice(2, 8);

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name, slug, phone_number: phone })
    .select()
    .single();

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });

  const { error: memberError } = await supabase
    .from('user_organizations')
    .insert({ user_id: user.id, org_id: org.id, role: 'owner' });

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });

  return NextResponse.json({ organization: org }, { status: 201 });
}
