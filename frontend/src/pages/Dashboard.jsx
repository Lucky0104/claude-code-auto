import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  ChatCircleDots, Robot, CheckSquare, WarningCircle, TrendUp, FacebookLogo, InstagramLogo, ArrowUpRight
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";

const KPI = [
  { key: "total_comments_today", label: "Comments Today", icon: ChatCircleDots, color: "text-foreground" },
  { key: "ai_replies_today", label: "AI Replies Sent", icon: Robot, color: "text-primary" },
  { key: "pending_approvals", label: "Pending Approvals", icon: CheckSquare, color: "text-[#F59E0B]" },
  { key: "negative_comments", label: "Negative Comments", icon: WarningCircle, color: "text-destructive" },
  { key: "total_leads", label: "Leads Generated", icon: TrendUp, color: "text-[#10B981]" },
  { key: "pages_connected", label: "Pages", icon: FacebookLogo, color: "text-foreground" },
  { key: "instagram_connected", label: "Instagram", icon: InstagramLogo, color: "text-foreground" },
];

export default function Dashboard() {
  const [stats, setStats] = useState({});
  const [trend, setTrend] = useState([]);
  const [cats, setCats] = useState([]);

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api.get("/analytics/overview"),
      api.get("/analytics/sentiment-trend?days=7"),
      api.get("/analytics/categories"),
    ]).then(([o, t, c]) => {
      if (cancel) return;
      setStats(o.data);
      setTrend(t.data);
      setCats(c.data);
    });
    return () => { cancel = true; };
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-[1600px]">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="overline text-muted-foreground">Control Room</div>
          <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>
            Dashboard
          </h1>
        </div>
        <Link
          to="/pages"
          data-testid="cta-connect-page"
          className="border border-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-foreground hover:text-white transition"
        >
          Connect a Page <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 border border-border">
        {KPI.map((k, i) => (
          <div key={k.key} data-testid={`kpi-${k.key}`} className={`p-5 border-border ${i < KPI.length - 1 ? "border-r" : ""} ${i < 4 ? "lg:border-b-0" : "border-t lg:border-t-0"}`}>
            <div className="flex items-center justify-between">
              <span className="overline text-muted-foreground">{k.label}</span>
              <k.icon size={14} className={k.color} weight="bold" />
            </div>
            <div className={`mt-3 text-3xl font-black tracking-tight ${k.color}`} style={{ fontFamily: "Chivo, sans-serif" }}>
              {stats[k.key] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-border mt-8 border border-border">
        <div className="bg-white p-6 lg:col-span-2">
          <div className="overline text-muted-foreground">Sentiment · last 7 days</div>
          <div className="mt-4 flex items-end gap-2 h-44">
            {trend.length === 0 && <div className="text-sm text-muted-foreground">No data yet — sync your pages to see trends.</div>}
            {trend.map((d) => {
              const total = d.positive + d.neutral + d.negative;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col-reverse">
                    <div style={{ height: `${(d.positive / Math.max(1, total)) * 140}px` }} className="bg-[#10B981]" title={`positive ${d.positive}`} />
                    <div style={{ height: `${(d.neutral / Math.max(1, total)) * 140}px` }} className="bg-muted-foreground/50" title={`neutral ${d.neutral}`} />
                    <div style={{ height: `${(d.negative / Math.max(1, total)) * 140}px` }} className="bg-destructive" title={`negative ${d.negative}`} />
                  </div>
                  <div className="mono text-[10px] text-muted-foreground">{d.date.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white p-6">
          <div className="overline text-muted-foreground">Top categories</div>
          <ul className="mt-4 space-y-2">
            {cats.slice(0, 7).map((c) => (
              <li key={c.category} className="flex items-center justify-between text-sm border-b border-dashed border-border pb-1.5">
                <span className="capitalize">{c.category.replaceAll("_", " ")}</span>
                <span className="mono font-semibold">{c.count}</span>
              </li>
            ))}
            {cats.length === 0 && <li className="text-sm text-muted-foreground">No comments classified yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
