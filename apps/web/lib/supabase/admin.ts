import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client. BYPASSES RLS — only use server-side after
 * validating the session, tenant, and role in app code. Never import from a
 * Client Component.
 */
export function createSupabaseAdminClient() {
  return createClient(publicEnv.supabaseUrl, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
