import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function AuditLogs() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let c = false;
    api.get("/audit").then(({ data }) => { if (!c) setItems(data); });
    return () => { c = true; };
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-[1200px]">
      <div className="overline text-muted-foreground">Compliance</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>Audit Logs</h1>
      <div className="mt-6 border border-border">
        <div className="grid grid-cols-12 px-5 py-3 bg-secondary overline text-muted-foreground border-b border-border">
          <div className="col-span-3">When</div>
          <div className="col-span-3">Actor</div>
          <div className="col-span-3">Action</div>
          <div className="col-span-3">Target</div>
        </div>
        {items.length === 0 && <div data-testid="audit-empty" className="p-10 text-center text-sm text-muted-foreground">No audit events yet.</div>}
        {items.map((a, i) => (
          <div key={`${a.at}-${i}`} className="grid grid-cols-12 px-5 py-3 text-sm border-b border-border last:border-0">
            <div className="col-span-3 mono text-xs text-muted-foreground">{a.at}</div>
            <div className="col-span-3 truncate">{a.actor_id || "system"}</div>
            <div className="col-span-3 font-semibold">{a.action}</div>
            <div className="col-span-3 text-muted-foreground truncate">{a.target}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
