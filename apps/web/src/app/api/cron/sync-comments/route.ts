import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { processOrgComments } from '@/lib/pipeline';
import { flushPostHog } from '@/lib/posthog';

export const maxDuration = 300;

const CONCURRENCY = 3;

/** GET /api/cron/sync-comments — Vercel Cron entrypoint (every 5 min). */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  const { data: rows, error } = await supabase
    .from('meta_connections')
    .select('org_id')
    .eq('is_active', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orgIds = [...new Set((rows ?? []).map((r) => r.org_id))];
  const results: unknown[] = [];

  // Bounded concurrency so one slow tenant doesn't stall the whole run
  for (let i = 0; i < orgIds.length; i += CONCURRENCY) {
    const batch = orgIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) => processOrgComments(id, supabase))
    );
    for (const s of settled) {
      results.push(s.status === 'fulfilled' ? s.value : { error: String(s.reason) });
    }
  }

  await flushPostHog();
  return NextResponse.json({ orgs_processed: orgIds.length, results });
}
