"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  useCampaign,
  useCampaignPosts,
  useConfigureCenter,
  useToggleMonitor,
} from "@/hooks/use-campaigns";
import { renderTemplate } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FormState {
  centerName: string;
  doctorName: string;
  address: string;
  phone: string;
  whatsapp: string;
  replyTemplate: string;
  useDefault: boolean;
}

const EMPTY: FormState = {
  centerName: "",
  doctorName: "",
  address: "",
  phone: "",
  whatsapp: "",
  replyTemplate: "",
  useDefault: true,
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: campaign, isLoading } = useCampaign(id);
  const { data: posts, isLoading: postsLoading } = useCampaignPosts(id);
  const configure = useConfigureCenter(id);
  const toggle = useToggleMonitor(id);

  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!campaign) return;
    setForm({
      centerName: campaign.centerName ?? "",
      doctorName: campaign.doctorName ?? "",
      address: campaign.address ?? "",
      phone: campaign.phone ?? "",
      whatsapp: campaign.whatsapp ?? "",
      replyTemplate: campaign.replyTemplate ?? "",
      useDefault: !campaign.replyTemplate,
    });
  }, [campaign]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const preview = useMemo(
    () =>
      renderTemplate(form.useDefault ? null : form.replyTemplate, {
        doctor_name: form.doctorName,
        center_name: form.centerName,
        phone: form.phone,
        address: form.address,
        whatsapp: form.whatsapp,
      }),
    [form],
  );

  function save() {
    if (!form.doctorName.trim() || !form.address.trim() || !form.phone.trim()) {
      toast.error("Doctor, address and phone are required");
      return;
    }
    configure.mutate(
      {
        centerName: form.centerName || null,
        doctorName: form.doctorName,
        address: form.address,
        phone: form.phone,
        whatsapp: form.whatsapp || null,
        replyTemplate: form.useDefault ? null : form.replyTemplate || null,
      },
      {
        onSuccess: () => toast.success("Centre configuration saved"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  function onToggle(postId: string, enable: boolean, permalink: string | null) {
    if (enable && !campaign?.isConfigured) {
      toast.error("Configure the centre before enabling monitoring");
      return;
    }
    toggle.mutate(
      { postId, enable, permalink },
      { onError: (e) => toast.error((e as Error).message) },
    );
  }

  if (isLoading || !campaign) {
    return (
      <div className="max-w-[1400px] p-6 md:p-10">
        <Skeleton className="h-8 w-64" />
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] p-6 md:p-10">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="detail-back"
      >
        <ArrowLeft size={14} /> Campaigns
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight lg:text-3xl">{campaign.name}</h1>
        {campaign.isConfigured ? (
          <Badge variant="outline" className="border-emerald-200 text-emerald-700">
            Configured
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not configured
          </Badge>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Centre configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Centre configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="center">Centre name</Label>
              <Input id="center" data-testid="cfg-center-name" value={form.centerName} onChange={set("centerName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor">Doctor name *</Label>
              <Input id="doctor" data-testid="cfg-doctor-name" value={form.doctorName} onChange={set("doctorName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address *</Label>
              <Input id="address" data-testid="cfg-address" value={form.address} onChange={set("address")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" data-testid="cfg-phone" value={form.phone} onChange={set("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input id="whatsapp" data-testid="cfg-whatsapp" value={form.whatsapp} onChange={set("whatsapp")} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="use-default"
                data-testid="cfg-use-default"
                checked={form.useDefault}
                onCheckedChange={(v) => setForm((s) => ({ ...s, useDefault: v }))}
              />
              <Label htmlFor="use-default">Use default template</Label>
            </div>
            {!form.useDefault && (
              <div className="space-y-1.5">
                <Label htmlFor="tpl">Reply template</Label>
                <Textarea
                  id="tpl"
                  data-testid="cfg-reply-template"
                  rows={4}
                  value={form.replyTemplate}
                  onChange={set("replyTemplate")}
                  placeholder="Use {doctor_name}, {center_name}, {phone}, {address}, {whatsapp}"
                />
              </div>
            )}
            <div>
              <div className="overline text-muted-foreground">Live preview</div>
              <div
                data-testid="cfg-preview"
                className="mt-1 whitespace-pre-wrap rounded-sm border border-border bg-secondary p-3 text-sm leading-relaxed"
              >
                {preview}
              </div>
            </div>
            <Button onClick={save} disabled={configure.isPending} data-testid="cfg-save">
              {configure.isPending ? "Saving…" : "Save configuration"}
            </Button>
          </CardContent>
        </Card>

        {/* Instagram posts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instagram posts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {postsLoading ? (
              <>
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </>
            ) : !posts || posts.length === 0 ? (
              <div
                className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground"
                data-testid="posts-empty"
              >
                No Instagram posts found for this campaign’s ads.
              </div>
            ) : (
              posts.map((p) => (
                <div
                  key={p.instagramPostId}
                  className="flex items-center gap-3 border border-border p-3"
                  data-testid={`post-${p.instagramPostId}`}
                >
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="h-12 w-12 rounded-sm object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-sm bg-secondary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.adName || p.instagramPostId}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{p.mediaType}</Badge>
                      <span className="mono">{p.repliesSent} replies</span>
                      {p.instagramPermalink && (
                        <a
                          href={p.instagramPermalink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          View <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={p.isMonitoring}
                    disabled={!campaign.isConfigured || toggle.isPending}
                    onCheckedChange={(v) => onToggle(p.instagramPostId, v, p.instagramPermalink)}
                    data-testid={`monitor-${p.instagramPostId}`}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
