import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/env';

/** Supabase client for Server Components and Route Handlers (cookie-based session). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
            // when middleware refreshes sessions.
          }
        },
      },
    }
  );
}

/** Supabase client authenticated via a Bearer token (used by the Chrome extension). */
export function createSupabaseTokenClient(accessToken: string) {
  return createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

/** Service-role client — bypasses RLS. ONLY for cron jobs and trusted server code. */
export function createSupabaseServiceClient() {
  return createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Resolve the authenticated user from either the session cookie (dashboard)
 * or an Authorization: Bearer header (extension). Returns the user and a
 * client bound to their identity so RLS applies.
 */
export async function getAuthenticatedClient(req: Request) {
  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const supabase = createSupabaseTokenClient(token);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) return { user: null, supabase: null };
    return { user, supabase };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { user: null, supabase: null };
  return { user, supabase };
}
