import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ArrowRight } from "@phosphor-icons/react";

const FIELDS = [
  ["business_name", "Business Name", "Acme Co"],
  ["industry", "Industry", "E-commerce"],
  ["website", "Website", "https://acme.co"],
  ["support_email", "Support Email", "help@acme.co"],
  ["support_phone", "Support Phone", "+1 555 123 4567"],
  ["timezone", "Timezone", "America/New_York"],
];

export default function Onboarding() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    business_name: "", industry: "", website: "", description: "",
    support_email: "", support_phone: "", timezone: "UTC",
    brand_tone: "friendly professional", reply_style: "concise",
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/tenant/onboard", form);
      await refresh();
      navigate("/pages");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto p-8 lg:p-14">
        <div className="overline text-muted-foreground">Setup · Step 1 of 1</div>
        <h1 className="text-4xl lg:text-5xl font-black tracking-tight mt-2" style={{ fontFamily: "Chivo, sans-serif" }}>
          Tell us about your business
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl">
          Claude uses this context to write authentic, on-brand replies. You can edit
          everything later under Settings.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          {FIELDS.map(([k, label, ph]) => (
            <div key={k}>
              <label className="overline text-muted-foreground">{label}</label>
              <input
                data-testid={`onboard-${k}`}
                value={form[k]}
                onChange={set(k)}
                placeholder={ph}
                className="mt-2 w-full border border-border px-3 py-2.5 focus:border-primary outline-none"
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="overline text-muted-foreground">Business Description</label>
            <textarea
              data-testid="onboard-description"
              value={form.description}
              onChange={set("description")}
              rows={3}
              placeholder="We sell premium leather bags handcrafted in Florence…"
              className="mt-2 w-full border border-border px-3 py-2.5 focus:border-primary outline-none resize-none"
            />
          </div>
          <div>
            <label className="overline text-muted-foreground">Brand Tone</label>
            <select
              data-testid="onboard-brand_tone"
              value={form.brand_tone}
              onChange={set("brand_tone")}
              className="mt-2 w-full border border-border px-3 py-2.5 bg-white outline-none focus:border-primary"
            >
              {["friendly professional", "playful", "luxury formal", "technical expert", "casual warm"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="overline text-muted-foreground">AI Reply Style</label>
            <select
              data-testid="onboard-reply_style"
              value={form.reply_style}
              onChange={set("reply_style")}
              className="mt-2 w-full border border-border px-3 py-2.5 bg-white outline-none focus:border-primary"
            >
              {["concise", "detailed", "conversational"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <button
          data-testid="onboard-submit"
          onClick={save}
          disabled={saving || !form.business_name}
          className="mt-10 bg-primary text-primary-foreground px-6 py-3 flex items-center gap-2 hover:bg-foreground hover:text-white transition disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue to integrations"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
