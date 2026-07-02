import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { fetchOrmSheet } from '@/lib/sheets';
import { track } from '@/lib/posthog';

export const maxDuration = 120;

/** GET /api/cron/sync-sheets — refresh every tenant's ORM rules (every 6h). */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: configs, error } = await supabase
    .from('google_sheets_config')
    .select('org_id, sheet_id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  let failed = 0;

  for (const config of configs ?? []) {
    try {
      const rows = await fetchOrmSheet(config.sheet_id);
      if (!rows.length) continue;

      for (const row of rows) {
        await supabase
          .from('orm_rules')
          .upsert(
            { org_id: config.org_id, ...row, is_active: true },
            { onConflict: 'org_id,comment_type' }
          );
      }

      const seenTypes = rows.map((r) => r.comment_type);
      await supabase
        .from('orm_rules')
        .update({ is_active: false })
        .eq('org_id', config.org_id)
        .not('comment_type', 'in', `(${seenTypes.map((t) => `"${t}"`).join(',')})`);

      await supabase
        .from('google_sheets_config')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('org_id', config.org_id);

      track('sheet_synced', { org_id: config.org_id, rules_count: rows.length });
      synced++;
    } catch (err) {
      failed++;
      track('sheet_sync_failed', {
        org_id: config.org_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ synced, failed });
}
