import { useState } from "react";
import { api } from "../lib/api";
import { FacebookLogo, ArrowRight } from "@phosphor-icons/react";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const handleFb = async () => {
    setLoading(true); setErr(null);
    try {
      const { data } = await api.get("/auth/facebook/login");
      // Break out of any iframe (Emergent preview, embed, etc.) — Facebook refuses to be iframed.
      if (window.top && window.top !== window.self) {
        window.top.location.href = data.url;
      } else {
        window.location.href = data.url;
      }
    } catch (e) {
      setErr("Failed to start Facebook login");
      setLoading(false);
    }
  };

  const search = new URLSearchParams(window.location.search);
  const errorParam = search.get("error");

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div
        className="relative hidden lg:block bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1672750771479-5ea73e9439ce?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200')",
        }}
      >
        <div className="absolute inset-0 bg-foreground/85" />
        <div className="relative z-10 h-full flex flex-col justify-between p-10 text-white">
          <div>
            <div className="overline text-white/70">Platform</div>
            <div className="text-3xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>
              DASH·AI
            </div>
          </div>
          <div className="space-y-6">
            <h1 className="text-5xl xl:text-6xl font-black tracking-tight leading-[0.95]" style={{ fontFamily: "Chivo, sans-serif" }}>
              Comment intelligence<br />for Meta platforms.
            </h1>
            <p className="text-white/70 max-w-md leading-relaxed">
              Connect Facebook Pages and Instagram Business Accounts. Let Claude classify,
              route negativity for human approval, and auto-reply when safe.
            </p>
            <div className="grid grid-cols-3 gap-px bg-white/10 mt-10 border border-white/10">
              {[
                ["14", "AI categories"],
                [">90%", "Auto-reply threshold"],
                ["RBAC", "Multi-tenant"],
              ].map(([k, v]) => (
                <div key={v} className="bg-foreground p-4">
                  <div className="text-2xl font-black" style={{ fontFamily: "Chivo, sans-serif" }}>{k}</div>
                  <div className="overline text-white/60 mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="overline text-white/40">Sprout · Hootsuite · ManyChat alternative</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-white">
        <div className="max-w-md w-full">
          <div className="overline text-muted-foreground">Sign in</div>
          <h2 className="text-3xl lg:text-4xl font-black tracking-tight mt-2" style={{ fontFamily: "Chivo, sans-serif" }}>
            Welcome back
          </h2>
          <p className="text-muted-foreground mt-2">
            Authenticate with Meta to manage your Pages and Instagram Business Accounts.
          </p>

          {(err || errorParam) && (
            <div data-testid="login-error" className="mt-6 border border-destructive/40 bg-destructive/5 text-destructive px-4 py-3 text-sm">
              {err || decodeURIComponent(errorParam)}
            </div>
          )}

          <button
            data-testid="facebook-login-button"
            onClick={handleFb}
            disabled={loading}
            className="mt-8 w-full bg-primary text-primary-foreground py-4 px-5 flex items-center justify-between hover:bg-foreground hover:text-white transition group disabled:opacity-60"
          >
            <span className="flex items-center gap-3">
              <FacebookLogo size={22} weight="fill" />
              <span className="font-semibold">{loading ? "Redirecting…" : "Continue with Facebook"}</span>
            </span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition" />
          </button>

          <div className="mt-8 text-xs text-muted-foreground space-y-2">
            <div className="overline">Required permissions</div>
            <ul className="mono text-[11px] leading-relaxed space-y-0.5">
              <li>pages_show_list · pages_read_engagement</li>
              <li>pages_manage_metadata · pages_manage_engagement</li>
              <li>instagram_basic · instagram_manage_comments</li>
              <li>business_management · email</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
