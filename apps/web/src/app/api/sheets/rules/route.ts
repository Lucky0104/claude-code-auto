import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';

/** GET /api/sheets/rules?org_id=... — current ORM rules for an org. */
export async function GET(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = new URL(req.url).searchParams.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  const [{ data: rules, error }, { data: config }] = await Promise.all([
    supabase
      .from('orm_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('priority', { ascending: false })
      .order('comment_type'),
    supabase
      .from('google_sheets_config')
      .select('sheet_id, last_synced_at')
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: rules ?? [], sheet: config ?? null });
}
