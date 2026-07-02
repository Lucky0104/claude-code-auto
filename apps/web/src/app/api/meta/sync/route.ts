import { NextResponse } from 'next/server';
import { getAuthenticatedClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { processOrgComments } from '@/lib/pipeline';
import { track } from '@/lib/posthog';
import type { Platform } from '@repo/types';

// Simple in-memory throttle: one manual sync per org per 30s
const lastSyncByOrg = new Map<string, number>();
const SYNC_COOLDOWN_MS = 30_000;

/**
 * POST /api/meta/sync — manually trigger the comment pipeline for one org.
 * Called by the Chrome extension's Start button.
 * Body: { org_id: string, platform?: 'facebook' | 'instagram' }
 */
export async function POST(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { org_id?: string; platform?: Platform };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const orgId = body.org_id;
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  const platform = body.platform;
  if (platform && !['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  // Membership check (agent+ can trigger sync)
  const { data: membership } = await supabase
    .from('user_organizations')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .single();

  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const last = lastSyncByOrg.get(orgId) ?? 0;
  if (Date.now() - last < SYNC_COOLDOWN_MS) {
    return NextResponse.json(
      { error: 'Sync already ran recently. Try again in a moment.' },
      { status: 429 }
    );
  }
  lastSyncByOrg.set(orgId, Date.now());

  track('manual_sync_triggered', { org_id: orgId, platform: platform ?? 'all' }, user.id);

  try {
    // Service client: the pipeline needs to decrypt tokens and write across tables
    const serviceClient = createSupabaseServiceClient();
    const result = await processOrgComments(orgId, serviceClient, platform);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
