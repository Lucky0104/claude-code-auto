"use client";

import { useMetrics } from "@/hooks/use-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function pct(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="overline text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useMetrics();

  return (
    <div className="max-w-[1400px] p-6 md:p-10">
      <div className="overline text-muted-foreground">Overview</div>
      <h1 className="mt-1 text-3xl font-black tracking-tight lg:text-4xl">Dashboard</h1>

      {error && (
        <div className="mt-6 border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load metrics: {(error as Error).message}
        </div>
      )}

      {isLoading || !data ? (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Comments received" value={data.commentsReceived} />
            <Stat label="Replies sent" value={data.repliesSent} />
            <Stat label="Reply rate" value={pct(data.replyRate)} />
            <Stat label="Monitoring active" value={data.monitoringActive} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topCampaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No replies yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topCampaigns.map((c) => (
                      <li key={c.name} className="flex justify-between text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="mono text-muted-foreground">{c.replies}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top centres</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topCenters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No replies yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topCenters.map((c) => (
                      <li key={c.name} className="flex justify-between text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="mono text-muted-foreground">{c.replies}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="activity-empty">
                  No comment activity yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentActivity.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="truncate">
                        <span className="font-medium">{c.commenterName ?? c.commenterId ?? "User"}</span>
                        <span className="text-muted-foreground"> — {c.commentText ?? ""}</span>
                      </span>
                      <span
                        className={
                          c.status === "REPLIED"
                            ? "text-emerald-600"
                            : c.status === "FAILED"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
