import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';
import { extractSheetId, fetchOrmSheet } from '@/lib/sheets';
import { track } from '@/lib/posthog';

/**
 * POST /api/sheets/sync — configure and/or sync a tenant's ORM sheet.
 * Body: { org_id: string, sheet_url?: string }
 * If sheet_url is provided, saves the config first; then fetches rows and
 * upserts orm_rules.
 */
export async function POST(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { org_id?: string; sheet_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const orgId = body.org_id;
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  // Save new sheet config if provided
  if (body.sheet_url) {
    let sheetId: string;
    try {
      sheetId = extractSheetId(body.sheet_url);
    } catch {
      return NextResponse.json({ error: 'Invalid Google Sheet URL' }, { status: 400 });
    }
    const { error } = await supabase
      .from('google_sheets_config')
      .upsert({ org_id: orgId, sheet_id: sheetId }, { onConflict: 'org_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  }

  // Load config
  const { data: config } = await supabase
    .from('google_sheets_config')
    .select('sheet_id')
    .eq('org_id', orgId)
    .single();

  if (!config) {
    return NextResponse.json({ error: 'No Google Sheet configured for this org' }, { status: 404 });
  }

  try {
    const rows = await fetchOrmSheet(config.sheet_id);
    if (!rows.length) {
      return NextResponse.json({ error: 'Sheet has no data rows' }, { status: 422 });
    }

    // Upsert each rule; deactivate rules no longer in the sheet
    const seenTypes = rows.map((r) => r.comment_type);

    for (const row of rows) {
      const { error } = await supabase.from('orm_rules').upsert(
        { org_id: orgId, ...row, is_active: true },
        { onConflict: 'org_id,comment_type' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase
      .from('orm_rules')
      .update({ is_active: false })
      .eq('org_id', orgId)
      .not('comment_type', 'in', `(${seenTypes.map((t) => `"${t}"`).join(',')})`);

    await supabase
      .from('google_sheets_config')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('org_id', orgId);

    track('sheet_synced', { org_id: orgId, rules_count: rows.length }, user.id);
    return NextResponse.json({ synced: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sheet fetch failed';
    track('sheet_sync_failed', { org_id: orgId, error: message }, user.id);
    return NextResponse.json(
      {
        error: `Could not read sheet: ${message}. Make sure the sheet is shared with the service account email.`,
      },
      { status: 502 }
    );
  }
}
