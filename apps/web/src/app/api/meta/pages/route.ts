import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';

/** GET /api/meta/pages?org_id=... — list connected pages/IG accounts (no tokens). */
export async function GET(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = new URL(req.url).searchParams.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('meta_connections')
    .select('id, platform, page_id, page_name, is_active, token_expires_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data ?? [] });
}
