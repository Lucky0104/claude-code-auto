import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowSquareOut, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "../lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "replied", label: "Replied" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped" },
];

const statusBadge = (status) => {
  if (status === "replied")
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status === "failed")
    return "bg-red-100 text-red-700 border-red-200";
  return "bg-muted text-muted-foreground border-border";
};

function relativeTime(iso) {
  if (!iso) return "";
  try {
    const then = new Date(iso).getTime();
    const diff = (Date.now() - then) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function Comments() {
  const [filters, setFilters] = useState({
    campaign_id: "",
    center_name: "",
    status: "",
    date_from: "",
    date_to: "",
    q: "",
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await api.get("/campaigns")).data,
  });

  const centerOptions = useMemo(() => {
    const set = new Set();
    campaigns.forEach((c) => {
      if (c.center_name) set.add(c.center_name);
    });
    return Array.from(set).sort();
  }, [campaigns]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) p.append(k, v);
    });
    return p.toString();
  }, [filters]);

  const { data, isLoading } = useQuery({
    queryKey: ["comment-logs", queryString],
    queryFn: async () =>
      (await api.get(`/campaigns/comment-logs${queryString ? "?" + queryString : ""}`)).data,
  });

  const items = data?.items || [];
  const set = (k) => (e) => setFilters((s) => ({ ...s, [k]: e.target?.value ?? e }));

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="overline text-muted-foreground">Inbox</div>
      <h1
        className="text-3xl lg:text-4xl font-black tracking-tight mt-1"
        style={{ fontFamily: "Chivo, sans-serif" }}
      >
        Comments
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Auto-reply feed across all monitored Instagram posts.
      </p>

      {/* Filters */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
        <div className="md:col-span-1">
          <Label className="text-[11px] overline text-muted-foreground">Campaign</Label>
          <select
            data-testid="filter-campaign"
            value={filters.campaign_id}
            onChange={set("campaign_id")}
            className="w-full h-9 border border-border bg-white text-sm px-2 rounded-sm"
          >
            <option value="">All</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-[11px] overline text-muted-foreground">Centre</Label>
          <select
            data-testid="filter-center"
            value={filters.center_name}
            onChange={set("center_name")}
            className="w-full h-9 border border-border bg-white text-sm px-2 rounded-sm"
          >
            <option value="">All</option>
            {centerOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-[11px] overline text-muted-foreground">Status</Label>
          <select
            data-testid="filter-status"
            value={filters.status}
            onChange={set("status")}
            className="w-full h-9 border border-border bg-white text-sm px-2 rounded-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-[11px] overline text-muted-foreground">From</Label>
          <Input
            data-testid="filter-date-from"
            type="date"
            value={filters.date_from}
            onChange={set("date_from")}
          />
        </div>
        <div className="md:col-span-1">
          <Label className="text-[11px] overline text-muted-foreground">To</Label>
          <Input
            data-testid="filter-date-to"
            type="date"
            value={filters.date_to}
            onChange={set("date_to")}
          />
        </div>
        <div className="md:col-span-1">
          <Label className="text-[11px] overline text-muted-foreground">Search</Label>
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              data-testid="filter-search"
              className="pl-7"
              placeholder="text…"
              value={filters.q}
              onChange={set("q")}
            />
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="mt-6 border border-border bg-white rounded-sm overflow-hidden">
        {isLoading && (
          <div className="p-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div
            data-testid="comments-empty"
            className="p-10 text-center text-sm text-muted-foreground"
          >
            No replies yet — start monitoring an Instagram post from a configured campaign.
          </div>
        )}
        {items.map((c) => (
          <div
            key={c.comment_id}
            data-testid={`comment-row-${c.comment_id}`}
            className="px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/30 transition"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="mono">{c.commenter_id || c.commenter_name || "unknown"}</span>
                {c.campaign_name && (
                  <Badge variant="outline" className="text-[10px]">
                    {c.campaign_name}
                  </Badge>
                )}
                {c.center_name && (
                  <Badge variant="outline" className="text-[10px] bg-secondary">
                    {c.center_name}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">{relativeTime(c.replied_at)}</span>
                <span className={`px-2 py-0.5 text-[10px] border rounded-sm font-semibold ${statusBadge(c.status)}`}>
                  {(c.status || "").toUpperCase()}
                </span>
                {c.instagram_permalink && (
                  <a
                    href={c.instagram_permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                    data-testid={`comment-view-${c.comment_id}`}
                  >
                    View post <ArrowSquareOut size={12} />
                  </a>
                )}
              </div>
            </div>

            <div className="mt-3 border-l-4 border-border bg-secondary/40 pl-3 py-2 text-sm">
              <div className="overline text-muted-foreground mb-1">Comment</div>
              <div className="whitespace-pre-wrap">{c.comment_text || <span className="text-muted-foreground italic">(no text)</span>}</div>
            </div>

            {c.reply_sent && (
              <div className="mt-2 border-l-4 border-emerald-300 bg-emerald-50/60 pl-3 py-2 text-sm">
                <div className="overline text-emerald-700 mb-1">Reply sent</div>
                <div className="whitespace-pre-wrap">{c.reply_sent}</div>
              </div>
            )}

            {c.status === "failed" && c.error && (
              <div className="mt-2 text-[11px] text-red-700">
                Error: {c.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
