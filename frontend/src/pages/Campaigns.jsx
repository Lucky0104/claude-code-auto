import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CheckCircle,
  Warning,
  ArrowLeft,
  InstagramLogo,
  FloppyDisk,
} from "@phosphor-icons/react";
import { api } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const fmtBudget = (paise) => {
  if (paise === null || paise === undefined || paise === "") return "—";
  const n = Number(paise);
  if (Number.isNaN(n)) return "—";
  // Meta returns budgets in the smallest currency unit (paise for INR)
  return INR.format(n / 100);
};

const StatusPill = ({ status }) => {
  const s = (status || "").toUpperCase();
  const cls =
    s === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : s === "PAUSED"
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold border ${cls} rounded-sm tracking-wide`}>
      {s || "—"}
    </span>
  );
};

function renderTemplate(template, c) {
  const fields = {
    doctor_name: c.doctor_name || "",
    center_name: c.center_name || "",
    phone: c.phone || "",
    address: c.address || "",
    whatsapp: c.whatsapp || "",
  };
  if (template) {
    let out = template;
    for (const [k, v] of Object.entries(fields)) {
      out = out.split(`{${k}}`).join(v);
    }
    return out;
  }
  return `Hi! Thanks for your interest. You can consult ${fields.doctor_name} at our ${fields.center_name} centre. \u260E ${fields.phone}  \u{1F4CD} ${fields.address}`;
}

// ---------------------------------------------------------------------------
// LIST VIEW
// ---------------------------------------------------------------------------
function CampaignsList({ onOpen }) {
  const qc = useQueryClient();
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await api.get("/campaigns")).data,
  });

  const syncMut = useMutation({
    mutationFn: async () => (await api.get("/campaigns/sync")).data,
    onSuccess: (data) => {
      toast.success(`Synced ${data.count} campaign${data.count === 1 ? "" : "s"} from Meta`);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Sync failed"),
  });

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline text-muted-foreground">Growth</div>
          <h1
            className="text-3xl lg:text-4xl font-black tracking-tight mt-1"
            style={{ fontFamily: "Chivo, sans-serif" }}
          >
            Campaigns
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure each centre, then start monitoring its Instagram posts.
          </p>
        </div>
        <Button
          data-testid="campaigns-sync"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="gap-2"
        >
          <ArrowsClockwise size={16} weight={syncMut.isPending ? "regular" : "bold"} className={syncMut.isPending ? "animate-spin" : ""} />
          {syncMut.isPending ? "Syncing…" : "Sync from Meta"}
        </Button>
      </div>

      <div className="mt-8 border border-border rounded-sm bg-white overflow-hidden">
        <div className="grid grid-cols-12 px-5 py-3 border-b border-border bg-secondary overline text-muted-foreground">
          <div className="col-span-4">Campaign</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Objective</div>
          <div className="col-span-2">Budget</div>
          <div className="col-span-2">Setup</div>
          <div className="col-span-1 text-right">Posts</div>
        </div>
        {isLoading && (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {!isLoading && campaigns.length === 0 && (
          <div
            data-testid="campaigns-empty"
            className="p-10 text-center text-sm text-muted-foreground"
          >
            No campaigns synced yet — click <span className="font-semibold">Sync from Meta</span>.
          </div>
        )}
        {campaigns.map((c) => {
          const budget = c.daily_budget || c.lifetime_budget;
          const budgetLabel = c.daily_budget ? `${fmtBudget(c.daily_budget)} / day` : c.lifetime_budget ? `${fmtBudget(c.lifetime_budget)} total` : "—";
          return (
            <button
              key={c.id}
              data-testid={`campaign-row-${c.id}`}
              onClick={() => onOpen(c.id)}
              className="w-full text-left grid grid-cols-12 px-5 py-4 border-b border-border last:border-0 items-center gap-2 text-sm hover:bg-secondary/40 transition"
            >
              <div className="col-span-4">
                <div className="font-semibold truncate">{c.name || "(untitled)"}</div>
                <div className="overline text-muted-foreground">{c.id}</div>
              </div>
              <div className="col-span-1">
                <StatusPill status={c.status} />
              </div>
              <div className="col-span-2 text-muted-foreground capitalize text-xs">
                {(c.objective || "").toLowerCase().replaceAll("_", " ")}
              </div>
              <div className="col-span-2 mono text-xs">{budget ? budgetLabel : "—"}</div>
              <div className="col-span-2">
                {c.is_configured ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                    <CheckCircle size={14} weight="fill" /> Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                    <Warning size={14} weight="fill" /> Setup required
                  </span>
                )}
              </div>
              <div className="col-span-1 text-right mono text-xs">
                {c.monitored_posts_count ?? 0}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DETAIL VIEW
// ---------------------------------------------------------------------------
function CenterConfigPanel({ campaign }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    center_name: campaign.center_name || "",
    doctor_name: campaign.doctor_name || "",
    address: campaign.address || "",
    phone: campaign.phone || "",
    whatsapp: campaign.whatsapp || "",
    reply_template: campaign.reply_template || "",
  });
  const [useDefault, setUseDefault] = useState(!campaign.reply_template);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        center_name: form.center_name || null,
        doctor_name: form.doctor_name,
        address: form.address,
        phone: form.phone,
        whatsapp: form.whatsapp || null,
        reply_template: useDefault ? null : form.reply_template || null,
      };
      return (await api.patch(`/campaigns/${campaign.id}/center-config`, payload)).data;
    },
    onSuccess: () => {
      toast.success("Centre configuration saved");
      qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-posts", campaign.id] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Save failed"),
  });

  const onSubmit = (e) => {
    e.preventDefault();
    if (!form.doctor_name || !form.address || !form.phone) {
      toast.error("Doctor, address and phone are required");
      return;
    }
    saveMut.mutate();
  };

  const livePreview = useMemo(
    () => renderTemplate(useDefault ? null : form.reply_template, form),
    [form, useDefault]
  );

  return (
    <Card className="border border-border rounded-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base" style={{ fontFamily: "Chivo, sans-serif" }}>
          Centre Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="center_name">Centre name</Label>
            <Input
              id="center_name"
              data-testid="cfg-center-name"
              value={form.center_name}
              onChange={set("center_name")}
              placeholder="e.g. Crysta IVF Bengaluru"
            />
          </div>
          <div>
            <Label htmlFor="doctor_name">
              Doctor name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="doctor_name"
              data-testid="cfg-doctor-name"
              value={form.doctor_name}
              onChange={set("doctor_name")}
              placeholder="Dr. ..."
              required
            />
          </div>
          <div>
            <Label htmlFor="address">
              Address <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="address"
              data-testid="cfg-address"
              value={form.address}
              onChange={set("address")}
              rows={2}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="phone">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                data-testid="cfg-phone"
                value={form.phone}
                onChange={set("phone")}
                required
              />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                data-testid="cfg-whatsapp"
                value={form.whatsapp}
                onChange={set("whatsapp")}
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="reply_template">Reply template</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  data-testid="cfg-use-default"
                  checked={useDefault}
                  onCheckedChange={(v) => {
                    setUseDefault(!!v);
                    if (v) setForm((s) => ({ ...s, reply_template: "" }));
                  }}
                />
                Use default template
              </label>
            </div>
            <Textarea
              id="reply_template"
              data-testid="cfg-reply-template"
              value={form.reply_template}
              onChange={set("reply_template")}
              rows={4}
              disabled={useDefault}
              placeholder="Hi! Consult {doctor_name} at {center_name}. \u260E {phone}  \u{1F4CD} {address}"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Available variables: {"{doctor_name}"}, {"{center_name}"}, {"{phone}"}, {"{address}"}, {"{whatsapp}"}
            </p>
          </div>

          <div className="border border-dashed border-border bg-secondary/40 p-3 rounded-sm">
            <div className="overline text-muted-foreground mb-1">Live preview</div>
            <div data-testid="cfg-preview" className="text-sm whitespace-pre-wrap leading-relaxed">
              {livePreview}
            </div>
          </div>

          <Button
            type="submit"
            data-testid="cfg-save"
            disabled={saveMut.isPending}
            className="gap-2 w-full"
          >
            <FloppyDisk size={16} weight="bold" />
            {saveMut.isPending ? "Saving…" : "Save configuration"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PostsPanel({ campaign }) {
  const qc = useQueryClient();
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["campaign-posts", campaign.id],
    queryFn: async () => (await api.get(`/campaigns/${campaign.id}/posts`)).data,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ postId, on }) => {
      if (on) return (await api.post(`/campaigns/${campaign.id}/posts/${postId}/monitor`)).data;
      return (await api.delete(`/campaigns/${campaign.id}/posts/${postId}/monitor`)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-posts", campaign.id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e) => toast.error(e.response?.data?.detail || "Action failed"),
  });

  const onToggle = (post, next) => {
    if (next && !campaign.is_configured) {
      toast.error("Configure the centre before starting monitoring");
      return;
    }
    toggleMut.mutate({ postId: post.instagram_post_id, on: next });
  };

  return (
    <Card className="border border-border rounded-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "Chivo, sans-serif" }}>
          <InstagramLogo size={18} weight="bold" /> Instagram Posts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}
        {!isLoading && posts.length === 0 && (
          <div data-testid="posts-empty" className="text-sm text-muted-foreground text-center py-10">
            No Instagram posts found for this campaign's ads yet.
          </div>
        )}
        <div className="space-y-3">
          {posts.map((p) => (
            <div
              key={p.instagram_post_id}
              data-testid={`post-${p.instagram_post_id}`}
              className="flex items-center gap-4 border border-border rounded-sm p-3 bg-white"
            >
              <div className="w-16 h-16 bg-secondary border border-border rounded-sm overflow-hidden shrink-0">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <InstagramLogo size={20} className="text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">{p.media_type}</Badge>
                  <span className="text-xs text-muted-foreground mono truncate">{p.ad_name}</span>
                </div>
                <a
                  href={p.instagram_permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                  data-testid={`post-link-${p.instagram_post_id}`}
                >
                  View on Instagram →
                </a>
                <div className="text-[11px] text-muted-foreground mt-1 mono">
                  {p.replies_sent} {p.replies_sent === 1 ? "reply" : "replies"} sent
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  data-testid={`post-toggle-${p.instagram_post_id}`}
                  checked={p.is_monitoring}
                  onCheckedChange={(v) => onToggle(p, !!v)}
                  disabled={toggleMut.isPending}
                />
                {p.is_monitoring ? (
                  <span className="text-[10px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Monitoring active
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground">Start monitoring</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignDetail({ id, onBack }) {
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => (await api.get(`/campaigns/${id}`)).data,
  });

  if (isLoading || !campaign) {
    return (
      <div className="p-6 md:p-10 max-w-[1400px] space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-1/2" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <button
        onClick={onBack}
        data-testid="detail-back"
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
      >
        <ArrowLeft size={14} /> Back to campaigns
      </button>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="overline text-muted-foreground">Campaign</div>
          <h1
            className="text-2xl lg:text-3xl font-black tracking-tight mt-1"
            style={{ fontFamily: "Chivo, sans-serif" }}
          >
            {campaign.name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusPill status={campaign.status} />
            <span className="text-xs text-muted-foreground capitalize">
              {(campaign.objective || "").toLowerCase().replaceAll("_", " ")}
            </span>
            {campaign.is_configured ? (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200" variant="outline">
                Configured
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline">
                Setup required
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CenterConfigPanel campaign={campaign} />
        <PostsPanel campaign={campaign} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Campaigns() {
  const [selected, setSelected] = useState(null);
  if (selected) {
    return <CampaignDetail id={selected} onBack={() => setSelected(null)} />;
  }
  return <CampaignsList onOpen={setSelected} />;
}
