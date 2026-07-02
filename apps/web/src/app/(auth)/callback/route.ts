import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** GET /callback?code=... — Supabase magic-link/OAuth code exchange. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-time users go to onboarding; the dashboard redirects there
      // automatically if they have no org.
      return NextResponse.redirect(`${url.origin}/`);
    }
  }

  return NextResponse.redirect(`${url.origin}/login?error=auth_failed`);
}
