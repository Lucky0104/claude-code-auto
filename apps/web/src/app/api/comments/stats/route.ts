import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';
import type { CommentStats } from '@repo/types';

/** GET /api/comments/stats?org_id=&from=&to= — aggregate dashboard counts. */
export async function GET(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const orgId = params.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  let query = supabase
    .from('comments')
    .select('status, comment_type, detected_language, platform')
    .eq('org_id', orgId);

  const from = params.get('from');
  if (from) query = query.gte('created_at', from);
  const to = params.get('to');
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const stats: CommentStats = {
    total_scanned: rows.length,
    total_replied: 0,
    total_failed: 0,
    reply_rate: 0,
    by_type: {},
    by_language: { en: 0, hi: 0, hn: 0, bn: 0, mr: 0 },
    by_platform: { facebook: 0, instagram: 0 },
  };

  for (const row of rows) {
    if (row.status === 'replied') {
      stats.total_replied++;
      if (row.comment_type) {
        stats.by_type[row.comment_type] = (stats.by_type[row.comment_type] ?? 0) + 1;
      }
      if (row.detected_language) {
        stats.by_language[row.detected_language as keyof typeof stats.by_language]++;
      }
      stats.by_platform[row.platform as keyof typeof stats.by_platform]++;
    }
    if (row.status === 'failed') stats.total_failed++;
  }

  stats.reply_rate =
    stats.total_scanned > 0
      ? Math.round((stats.total_replied / stats.total_scanned) * 1000) / 10
      : 0;

  return NextResponse.json({ stats });
}
