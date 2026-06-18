"use client";

import Link from "next/link";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useCampaigns, useSyncCampaigns } from "@/hooks/use-campaigns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmtBudget(minor: string | null): string {
  if (!minor) return "—";
  const n = Number(minor);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n / 100);
}

function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "";
  const cls =
    s === "ACTIVE"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : s === "PAUSED"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-muted text-muted-foreground";
  return <span className={`inline-block border px-2 py-0.5 text-xs ${cls}`}>{s || "—"}</span>;
}

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useCampaigns();
  const sync = useSyncCampaigns();

  function runSync() {
    sync.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(`Synced ${r.count} campaign${r.count === 1 ? "" : "s"} from Meta`),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="max-w-[1400px] p-6 md:p-10">
      <div className="flex items-start justify-between">
        <div>
          <div className="overline text-muted-foreground">Growth</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight lg:text-4xl">Campaigns</h1>
        </div>
        <Button onClick={runSync} disabled={sync.isPending} data-testid="campaigns-sync">
          <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
          Sync from Meta
        </Button>
      </div>

      <div className="mt-8 border border-border">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <div
            className="border-dashed p-10 text-center text-sm text-muted-foreground"
            data-testid="campaigns-empty"
          >
            No campaigns yet. Click “Sync from Meta” to import your ad campaigns.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Objective</TableHead>
                <TableHead>Budget/day</TableHead>
                <TableHead>Configured</TableHead>
                <TableHead className="text-right">Monitoring</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.id} data-testid={`campaign-row-${c.id}`}>
                  <TableCell>
                    <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.objective ?? "—"}</TableCell>
                  <TableCell className="mono">{fmtBudget(c.dailyBudget)}</TableCell>
                  <TableCell>
                    {c.isConfigured ? (
                      <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right mono">{c.monitoredPostsCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
