import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Analytics() {
  const [trend, setTrend] = useState([]);
  const [cats, setCats] = useState([]);
  const [tops, setTops] = useState([]);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api.get("/analytics/sentiment-trend?days=14"),
      api.get("/analytics/categories"),
      api.get("/analytics/top-pages"),
    ]).then(([t, c, p]) => {
      if (cancel) return;
      setTrend(t.data); setCats(c.data); setTops(p.data);
    });
    return () => { cancel = true; };
  }, []);

  const max = Math.max(1, ...cats.map((c) => c.count));

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="overline text-muted-foreground">Reports</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>Analytics</h1>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-px bg-border border border-border">
        <div className="bg-white p-6">
          <div className="overline text-muted-foreground">Sentiment · 14 days</div>
          <div className="mt-5 flex items-end gap-1 h-56">
            {trend.map((d) => {
              const total = d.positive + d.neutral + d.negative;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col-reverse">
                    <div style={{ height: `${(d.positive / Math.max(1, total)) * 200}px` }} className="bg-[#10B981]" />
                    <div style={{ height: `${(d.neutral / Math.max(1, total)) * 200}px` }} className="bg-muted-foreground/50" />
                    <div style={{ height: `${(d.negative / Math.max(1, total)) * 200}px` }} className="bg-destructive" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6">
          <div className="overline text-muted-foreground">Categories distribution</div>
          <ul className="mt-5 space-y-2">
            {cats.map((c) => (
              <li key={c.category} data-testid={`cat-${c.category}`} className="flex items-center gap-3">
                <span className="w-32 text-xs capitalize truncate">{c.category?.replaceAll("_", " ")}</span>
                <div className="flex-1 bg-secondary h-3 relative">
                  <div className="bg-primary h-3" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
                <span className="mono text-xs w-10 text-right">{c.count}</span>
              </li>
            ))}
            {cats.length === 0 && <li className="text-sm text-muted-foreground">No data yet</li>}
          </ul>
        </div>

        <div className="bg-white p-6 lg:col-span-2">
          <div className="overline text-muted-foreground">Top performing pages</div>
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tops.map((t, idx) => (
              <div key={t.page?.page_id || `top-${idx}`} data-testid={`top-page-${idx}`} className="border border-border p-4">
                <div className="font-bold">{t.page?.name || "—"}</div>
                <div className="overline text-muted-foreground mt-1">{t.page?.category || ""}</div>
                <div className="mt-3 text-3xl font-black" style={{ fontFamily: "Chivo, sans-serif" }}>{t.comments}</div>
                <div className="overline text-muted-foreground mt-1">comments</div>
              </div>
            ))}
            {tops.length === 0 && <div className="text-sm text-muted-foreground">No data yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
