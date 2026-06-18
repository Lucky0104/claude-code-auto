import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";

const TONES = ["friendly professional", "playful", "luxury formal", "technical expert", "casual warm"];

export default function Settings() {
  const [t, setT] = useState(null);

  useEffect(() => { api.get("/tenant").then((r) => setT(r.data)); }, []);

  const save = async () => {
    const { data } = await api.patch("/tenant", {
      business_name: t.business_name, industry: t.industry, website: t.website,
      description: t.description, brand_tone: t.brand_tone, reply_style: t.reply_style,
      support_email: t.support_email, support_phone: t.support_phone, timezone: t.timezone,
      auto_reply_enabled: t.auto_reply_enabled,
    });
    setT(data);
    toast.success("Settings saved");
  };

  if (!t) return <div className="p-10"><span className="overline text-muted-foreground">Loading…</span></div>;

  const field = (k, label) => (
    <div>
      <label className="overline text-muted-foreground">{label}</label>
      <input
        data-testid={`setting-${k}`}
        value={t[k] || ""}
        onChange={(e) => setT({ ...t, [k]: e.target.value })}
        className="mt-2 w-full border border-border px-3 py-2.5 text-sm focus:border-primary outline-none"
      />
    </div>
  );

  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <div className="overline text-muted-foreground">Workspace</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        {field("business_name", "Business Name")}
        {field("industry", "Industry")}
        {field("website", "Website")}
        {field("support_email", "Support Email")}
        {field("support_phone", "Support Phone")}
        {field("timezone", "Timezone")}
        <div className="md:col-span-2">
          <label className="overline text-muted-foreground">Description</label>
          <textarea
            data-testid="setting-description"
            value={t.description || ""}
            onChange={(e) => setT({ ...t, description: e.target.value })}
            rows={3}
            className="mt-2 w-full border border-border px-3 py-2.5 text-sm focus:border-primary outline-none resize-none"
          />
        </div>
        <div>
          <label className="overline text-muted-foreground">Brand Tone</label>
          <select
            data-testid="setting-brand_tone"
            value={t.brand_tone || ""}
            onChange={(e) => setT({ ...t, brand_tone: e.target.value })}
            className="mt-2 w-full border border-border px-3 py-2.5 text-sm bg-white outline-none focus:border-primary"
          >
            {TONES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className="overline text-muted-foreground">AI Reply Style</label>
          <select
            data-testid="setting-reply_style"
            value={t.reply_style || ""}
            onChange={(e) => setT({ ...t, reply_style: e.target.value })}
            className="mt-2 w-full border border-border px-3 py-2.5 text-sm bg-white outline-none focus:border-primary"
          >
            {["concise", "detailed", "conversational"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>

        <div className="md:col-span-2 border border-border p-4 flex items-center justify-between mt-2">
          <div>
            <div className="font-semibold text-sm">Auto-reply on safe categories</div>
            <p className="text-xs text-muted-foreground">When OFF, every reply waits in the approval queue.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              data-testid="setting-auto-reply-toggle"
              type="checkbox"
              checked={!!t.auto_reply_enabled}
              onChange={(e) => setT({ ...t, auto_reply_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-secondary peer-checked:bg-primary border border-border relative transition">
              <div className={`absolute top-0.5 ${t.auto_reply_enabled ? "left-5" : "left-0.5"} w-4 h-4 bg-white border border-border transition`} />
            </div>
          </label>
        </div>
      </div>

      <button
        data-testid="settings-save"
        onClick={save}
        className="mt-8 bg-primary text-white px-6 py-3 font-semibold text-sm hover:bg-foreground transition"
      >
        Save changes
      </button>
    </div>
  );
}
