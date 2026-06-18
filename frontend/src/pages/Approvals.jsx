import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { CheckCircle, XCircle, PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function Approvals() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState({});

  const load = async () => {
    const { data } = await api.get("/approvals");
    setItems(data);
    const ed = {};
    data.forEach((a) => { ed[a.comment_id] = a.suggested_reply || ""; });
    setEditing(ed);
  };
  useEffect(() => { load(); }, []);

  const act = async (commentId, action) => {
    try {
      const payload = action === "edit"
        ? { action: "edit", edited_reply: editing[commentId] }
        : { action };
      await api.post(`/approvals/${commentId}/action`, payload);
      toast.success(`Reply ${action === "reject" ? "rejected" : "posted"}`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action failed");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="overline text-muted-foreground">Human-in-the-loop</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>
        Approval Queue
      </h1>
      <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
        Sensitive or low-confidence AI replies require manual review before posting to Meta.
      </p>

      <div className="mt-8 space-y-6">
        {items.length === 0 && (
          <div data-testid="approvals-empty" className="border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            All clear — no comments awaiting approval.
          </div>
        )}

        {items.map((a) => (
          <div key={a.comment_id} data-testid={`approval-${a.comment_id}`} className="border border-border bg-white">
            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-px bg-border">
              <div className="bg-white p-5">
                <div className="overline text-muted-foreground">Original Comment</div>
                <div className="mt-2 font-semibold">{a.comment?.from_name || "Unknown"}</div>
                <p className="mt-2 leading-relaxed text-sm">{a.comment?.message}</p>
                <div className="mt-4 flex gap-3 flex-wrap text-[10px]">
                  <span className="border border-border px-2 py-0.5 capitalize">{a.comment?.category?.replaceAll("_", " ")}</span>
                  <span className="border border-border px-2 py-0.5 capitalize">sentiment: {a.comment?.sentiment}</span>
                  <span className="border border-border px-2 py-0.5">conf: {a.comment?.confidence}%</span>
                </div>
              </div>
              <div className="bg-white p-5">
                <div className="overline text-muted-foreground">AI-Suggested Reply</div>
                <textarea
                  data-testid={`approval-edit-${a.comment_id}`}
                  value={editing[a.comment_id] || ""}
                  onChange={(e) => setEditing({ ...editing, [a.comment_id]: e.target.value })}
                  rows={5}
                  className="mt-2 w-full border border-border px-3 py-2.5 text-sm focus:border-primary outline-none resize-none"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    data-testid={`approval-approve-${a.comment_id}`}
                    onClick={() => act(a.comment_id, "approve")}
                    className="bg-primary text-white px-4 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-foreground transition"
                  >
                    <CheckCircle size={14} weight="bold" /> Approve & Post
                  </button>
                  <button
                    data-testid={`approval-edit-post-${a.comment_id}`}
                    onClick={() => act(a.comment_id, "edit")}
                    className="border border-foreground px-4 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-foreground hover:text-white transition"
                  >
                    <PencilSimple size={14} weight="bold" /> Edit & Post
                  </button>
                  <button
                    data-testid={`approval-reject-${a.comment_id}`}
                    onClick={() => act(a.comment_id, "reject")}
                    className="border border-destructive text-destructive px-4 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-destructive hover:text-white transition ml-auto"
                  >
                    <XCircle size={14} weight="bold" /> Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
