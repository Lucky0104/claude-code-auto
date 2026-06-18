import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ChatCircleDots, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS = ["new", "contacted", "qualified", "won", "lost"];

export default function Leads() {
  const [items, setItems] = useState([]);
  const [drafting, setDrafting] = useState(null);
  const [drafts, setDrafts] = useState({});

  const load = async () => {
    const { data } = await api.get("/leads");
    setItems(data);
    const d = {};
    data.forEach((l) => { if (l.dm_draft) d[l.comment_id] = l.dm_draft; });
    setDrafts(d);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    await api.patch(`/leads/${id}?status=${status}`);
    await load();
  };

  const generateDm = async (id) => {
    setDrafting(id);
    try {
      const { data } = await api.post(`/leads/${id}/generate-dm`);
      setDrafts((d) => ({ ...d, [id]: data.dm }));
      toast.success("DM draft generated");
    } catch (e) {
      toast.error(e.response?.data?.detail || "DM generation failed");
    } finally { setDrafting(null); }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="overline text-muted-foreground">Pipeline</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>Leads</h1>
      <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
        High-intent commenters detected by Claude. Generate a personal DM opener with one click and copy it to send.
      </p>

      <div className="mt-6 space-y-3">
        {items.length === 0 && <div data-testid="leads-empty" className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No leads yet.</div>}
        {items.map((l) => (
          <div key={l.comment_id} data-testid={`lead-${l.comment_id}`} className="border border-border bg-white">
            <div className="p-5 grid grid-cols-12 gap-4 items-start">
              <div className="col-span-12 md:col-span-3">
                <div className="font-bold truncate">{l.from_name}</div>
                <div className="overline text-muted-foreground mt-1">{l.category?.replaceAll("_", " ")}</div>
                <span className={`mt-2 inline-block mono px-2 py-0.5 border text-xs ${l.score >= 75 ? "border-[#10B981] text-[#10B981] bg-[#10B981]/5" : "border-border"}`}>score {l.score}</span>
              </div>
              <div className="col-span-12 md:col-span-6 text-sm leading-relaxed">{l.message}</div>
              <div className="col-span-12 md:col-span-3 flex flex-col gap-2">
                <select
                  data-testid={`lead-status-${l.comment_id}`}
                  value={l.status}
                  onChange={(e) => updateStatus(l.comment_id, e.target.value)}
                  className="border border-border px-2 py-1.5 text-xs bg-white"
                >
                  {STATUS.map((s) => <option key={s}>{s}</option>)}
                </select>
                <button
                  data-testid={`lead-dm-${l.comment_id}`}
                  onClick={() => generateDm(l.comment_id)}
                  disabled={drafting === l.comment_id}
                  className="bg-primary text-white px-3 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-foreground transition disabled:opacity-60"
                >
                  <ChatCircleDots size={12} weight="bold" /> {drafting === l.comment_id ? "Drafting…" : drafts[l.comment_id] ? "Regenerate DM" : "Generate DM"}
                </button>
              </div>
            </div>
            {drafts[l.comment_id] && (
              <div className="border-t border-border bg-secondary/30 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="overline text-muted-foreground">AI-drafted DM</div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(drafts[l.comment_id]); toast.success("DM copied"); }}
                    className="border border-border px-2 py-1 text-xs flex items-center gap-1 hover:bg-foreground hover:text-white"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <p className="text-sm leading-relaxed">{drafts[l.comment_id]}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

