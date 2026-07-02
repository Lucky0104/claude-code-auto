import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedClient } from '@/lib/supabase/server';
import { buildMetaOAuthUrl } from '@/lib/meta';

/**
 * GET /api/meta/auth?org_id=... — start Meta OAuth.
 * State is HMAC-signed so the callback can verify it wasn't tampered with.
 */
export async function GET(req: Request) {
  const { user, supabase } = await getAuthenticatedClient(req);
  if (!user || !supabase) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = new URL(req.url).searchParams.get('org_id');
  if (!orgId) return NextResponse.json({ error: 'org_id is required' }, { status: 400 });

  // Verify caller is owner/admin of the org
  const { data: membership } = await supabase
    .from('user_organizations')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = `${orgId}:${user.id}:${Date.now()}`;
  const sig = crypto
    .createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
    .update(payload)
    .digest('hex');
  const state = Buffer.from(`${payload}:${sig}`).toString('base64url');

  return NextResponse.redirect(buildMetaOAuthUrl(state));
}
