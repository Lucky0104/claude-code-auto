import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

const KINDS = ["product", "service", "faq", "policy", "info"];

export default function KnowledgeBase() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ kind: "faq", title: "", content: "" });

  const load = async () => {
    const { data } = await api.get("/kb");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.title || !form.content) return;
    try {
      await api.post("/kb", form);
      setForm({ kind: form.kind, title: "", content: "" });
      toast.success("Saved to knowledge base");
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await api.delete(`/kb/${id}`);
    await load();
  };

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="overline text-muted-foreground">RAG</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>Knowledge Base</h1>
      <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
        Claude retrieves relevant entries before writing replies. Add product info, FAQs, and policies to ground responses.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-1">
          <div className="border border-border p-5">
            <div className="overline text-muted-foreground">New entry</div>
            <select
              data-testid="kb-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className="mt-3 w-full border border-border px-3 py-2 bg-white text-sm"
            >
              {KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
            <input
              data-testid="kb-title"
              placeholder="Title (e.g. Shipping policy)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-3 w-full border border-border px-3 py-2 text-sm focus:border-primary outline-none"
            />
            <textarea
              data-testid="kb-content"
              placeholder="Content"
              rows={6}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="mt-3 w-full border border-border px-3 py-2 text-sm focus:border-primary outline-none resize-none"
            />
            <button
              data-testid="kb-create"
              onClick={create}
              className="mt-4 bg-primary text-white px-4 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-foreground transition"
            >
              <Plus size={14} weight="bold" /> Add entry
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          {items.length === 0 ? (
            <div data-testid="kb-empty" className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Knowledge base is empty.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((e) => (
                <div key={e.id} data-testid={`kb-item-${e.id}`} className="border border-border p-5 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="overline text-muted-foreground">{e.kind}</div>
                      <div className="font-bold mt-1">{e.title}</div>
                    </div>
                    <button data-testid={`kb-delete-${e.id}`} onClick={() => del(e.id)} className="border border-border p-1 hover:bg-destructive hover:text-white hover:border-destructive">
                      <Trash size={12} />
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{e.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
