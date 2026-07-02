import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/server';

const MAX_LIMIT = 100;

/**
 * GET /api/comments?org_id=&status=&platform=&language=&type=&from=&to=&page=&limit=
 * Paginated comment feed with joined replies.
 */
export async function GET(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const orgId = params.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.get('limit') ?? '25', 10) || 25));
  const offset = (page - 1) * limit;

  let query = supabase
    .from('comments')
    .select('*, replies(reply_text, language, meta_reply_id, created_at)', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const status = params.get('status');
  if (status) query = query.eq('status', status);

  const platform = params.get('platform');
  if (platform) query = query.eq('platform', platform);

  const language = params.get('language');
  if (language) query = query.eq('detected_language', language);

  const type = params.get('type');
  if (type) query = query.eq('comment_type', type);

  const from = params.get('from');
  if (from) query = query.gte('created_at', from);

  const to = params.get('to');
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    comments: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}
