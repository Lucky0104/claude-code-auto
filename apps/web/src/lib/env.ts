// Central Supabase config. The defaults point at this product's production
// project (anon keys are public by design — RLS is the security boundary);
// NEXT_PUBLIC_* env vars override them per deployment.
// NEXT_PUBLIC_* references are inlined at build time, including in this file.

const DEFAULT_SUPABASE_URL = 'https://obiecguouefiuuhmmqth.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iaWVjZ3VvdWVmaXV1aG1tcXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5Nzk0MjUsImV4cCI6MjA5ODU1NTQyNX0.1QAkJ9Ep4MA1LDhS32AOPw4iZnKF26uhGh7PZqjUG-s';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
