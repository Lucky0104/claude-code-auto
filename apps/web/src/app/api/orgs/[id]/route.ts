import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';

type Params = { params: { id: string } };

/** GET /api/orgs/:id */
export async function GET(req: Request, { params }: Params) {
  const { id } = params;
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.from('organizations').select('*').eq('id', id).single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ organization: data });
}

/** PATCH /api/orgs/:id — update name / phone_number (RLS: owner/admin only). */
export async function PATCH(req: Request, { params }: Params) {
  const { id } = params;
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; phone_number?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.phone_number?.trim()) {
    if (!/^[0-9+\-\s]{6,20}$/.test(body.phone_number.trim())) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }
    updates.phone_number = body.phone_number.trim();
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 403 });
  return NextResponse.json({ organization: data });
}

/** DELETE /api/orgs/:id — owner only (enforced by RLS). */
export async function DELETE(req: Request, { params }: Params) {
  const { id } = params;
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase.from('organizations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ ok: true });
}
