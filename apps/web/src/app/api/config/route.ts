import { NextResponse } from 'next/server';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Public runtime config for the Chrome extension. The Supabase URL and anon
 * key are public by design (they ship in every browser bundle; RLS is the
 * security boundary). Serving them here means the extension is built once
 * with only VITE_API_URL and picks up Supabase config at runtime.
 */
export async function GET() {
  const configured = isSupabaseConfigured();
  return NextResponse.json(
    {
      configured,
      supabase_url: configured ? SUPABASE_URL : null,
      supabase_anon_key: configured ? SUPABASE_ANON_KEY : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
