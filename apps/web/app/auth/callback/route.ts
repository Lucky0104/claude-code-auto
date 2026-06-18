import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { afterFacebookLogin } from "@/features/auth/service";
import { captureError } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Supabase OAuth callback: exchange the code for a session, then bootstrap. */
export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      try {
        await afterFacebookLogin(data.session);
      } catch (e) {
        captureError(e, { scope: "afterFacebookLogin" });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
