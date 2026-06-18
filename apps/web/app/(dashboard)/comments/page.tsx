"use client";

import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useCommentLogs } from "@/hooks/use-comment-logs";
import { useCampaigns } from "@/hooks/use-campaigns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "REPLIED"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : status === "FAILED"
        ? "bg-red-100 text-red-700 border-red-200"
        : "bg-muted text-muted-foreground";
  return <span className={`inline-block border px-2 py-0.5 text-xs ${cls}`}>{status}</span>;
}

interface Filters {
  campaignId: string;
  status: string;
  q: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

const PAGE_SIZE = 20;

export default function CommentsPage() {
  const [filters, setFilters] = useState<Filters>({
    campaignId: "",
    status: "",
    q: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
  });

  const { data: campaigns } = useCampaigns();
  const { data, isLoading } = useCommentLogs({
    campaignId: filters.campaignId || undefined,
    status: filters.status || undefined,
    q: filters.q || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  });

  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="max-w-[1400px] p-6 md:p-10">
      <div className="overline text-muted-foreground">Activity</div>
      <h1 className="mt-1 text-3xl font-black tracking-tight lg:text-4xl">Comments</h1>

      {/* Filters */}
      <div className="mt-6 grid gap-3 md:grid-cols-5">
        <div>
          <Label className="overline text-muted-foreground">Campaign</Label>
          <select
            data-testid="filter-campaign"
            value={filters.campaignId}
            onChange={(e) => update({ campaignId: e.target.value })}
            className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm"
          >
            <option value="">All campaigns</option>
            {(campaigns ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="overline text-muted-foreground">Status</Label>
          <select
            data-testid="filter-status"
            value={filters.status}
            onChange={(e) => update({ status: e.target.value })}
            className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm"
          >
            <option value="">All</option>
            <option value="REPLIED">Replied</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </div>
        <div>
          <Label className="overline text-muted-foreground">From</Label>
          <Input
            type="date"
            data-testid="filter-date-from"
            value={filters.dateFrom}
            onChange={(e) => update({ dateFrom: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="overline text-muted-foreground">To</Label>
          <Input
            type="date"
            data-testid="filter-date-to"
            value={filters.dateTo}
            onChange={(e) => update({ dateTo: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="overline text-muted-foreground">Search</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="filter-search"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Search…"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="mt-6 space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : !data || data.items.length === 0 ? (
          <div
            className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
            data-testid="comments-empty"
          >
            No comments match these filters yet.
          </div>
        ) : (
          data.items.map((c) => (
            <div key={c.id} className="border border-border p-4" data-testid={`comment-${c.commentId}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{c.commenterName ?? c.commenterId ?? "User"}</span>
                  {c.campaignName && <Badge variant="outline">{c.campaignName}</Badge>}
                  {c.centerName && <Badge variant="outline">{c.centerName}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{relativeTime(c.repliedAt ?? c.createdAt)}</span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
              <p className="mt-2 text-sm">{c.commentText}</p>
              {c.replyText && (
                <p className="mt-2 border-l-2 border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
                  {c.replyText}
                </p>
              )}
              {c.status === "FAILED" && c.error && (
                <p className="mt-2 text-xs text-destructive">Error: {c.error}</p>
              )}
              {c.instagramPermalink && (
                <a
                  href={c.instagramPermalink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  View post <ExternalLink size={12} />
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {totalPages} · {data.total} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
