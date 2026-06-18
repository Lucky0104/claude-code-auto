"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Facebook } from "lucide-react";

const SCOPES =
  "public_profile,email,pages_show_list,business_management,ads_read,pages_read_engagement,pages_manage_engagement,instagram_manage_comments";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: SCOPES },
    });
    if (error) setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="overline text-muted-foreground">Crysta IVF</div>
          <CardTitle className="text-2xl">Comment Automation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sign in with Facebook to manage Instagram comment automation across your IVF
            campaigns.
          </p>
          <Button
            className="w-full"
            onClick={signIn}
            disabled={loading}
            data-testid="login-facebook"
          >
            <Facebook className="mr-2 h-4 w-4" />
            {loading ? "Redirecting…" : "Continue with Facebook"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
