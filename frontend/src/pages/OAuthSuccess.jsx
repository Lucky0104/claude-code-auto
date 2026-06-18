import { useEffect } from "react";

export default function OAuthSuccess() {
  useEffect(() => {
    // httpOnly cookie was set by /api/auth/facebook/callback. Clear any stale tenant
    // so the freshly-issued JWT's default tenant is picked up.
    localStorage.removeItem("dashai_tid");
    window.location.href = "/dashboard";
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="overline text-muted-foreground">Authenticating…</div>
    </div>
  );
}
