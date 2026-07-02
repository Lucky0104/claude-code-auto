import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { exchangeCodeForToken, exchangeForLongLivedToken, getUserPages } from '@/lib/meta';
import { encrypt } from '@/lib/crypto';
import { track } from '@/lib/posthog';

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * GET /api/meta/callback?code=...&state=... — Meta OAuth callback.
 * Exchanges the code, upserts one meta_connection per page (facebook) and
 * per linked IG business account (instagram).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const appUrl = url.origin;

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?error=oauth_cancelled`);
  }

  // Verify HMAC-signed state
  let orgId: string;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) throw new Error('bad state');
    const [org, userId, ts, sig] = parts;
    const payload = `${org}:${userId}:${ts}`;
    const expected = crypto
      .createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
      .update(payload)
      .digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new Error('bad signature');
    }
    if (Date.now() - Number(ts) > STATE_MAX_AGE_MS) throw new Error('state expired');
    orgId = org;
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=invalid_state`);
  }

  try {
    const shortToken = await exchangeCodeForToken(code);
    const { access_token: longToken, expires_in } = await exchangeForLongLivedToken(shortToken);
    const pages = await getUserPages(longToken);

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    const supabase = createSupabaseServiceClient();

    for (const page of pages) {
      // Page tokens derived from a long-lived user token don't expire
      await supabase.from('meta_connections').upsert(
        {
          org_id: orgId,
          platform: 'facebook',
          page_id: page.id,
          page_name: page.name,
          access_token: encrypt(page.access_token),
          token_expires_at: expiresAt,
          is_active: true,
        },
        { onConflict: 'org_id,platform,page_id' }
      );
      track('meta_connected', { org_id: orgId, platform: 'facebook', page_id: page.id });

      if (page.instagram_business_account) {
        await supabase.from('meta_connections').upsert(
          {
            org_id: orgId,
            platform: 'instagram',
            page_id: page.instagram_business_account.id,
            page_name: page.instagram_business_account.username ?? page.name,
            access_token: encrypt(page.access_token),
            token_expires_at: expiresAt,
            is_active: true,
          },
          { onConflict: 'org_id,platform,page_id' }
        );
        track('meta_connected', { org_id: orgId, platform: 'instagram' });
      }
    }

    return NextResponse.redirect(`${appUrl}/settings?connected=${pages.length}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    track('meta_connect_failed', { org_id: orgId, error: message });
    return NextResponse.redirect(`${appUrl}/settings?error=meta_exchange_failed`);
  }
}
