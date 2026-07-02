// Central Supabase config. Falls back to placeholder values so the app can
// build and deploy before the Supabase project exists; isSupabaseConfigured()
// gates anything that would actually hit the network.
// NEXT_PUBLIC_* references are inlined at build time, including in this file.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key';

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
