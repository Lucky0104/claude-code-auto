import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ArrowsClockwise, Plus, Trash, FacebookLogo, InstagramLogo } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function PagesPage() {
  const [connected, setConnected] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(null);

  const load = async () => {
    const c = await api.get("/pages");
    setConnected(c.data);
  };

  useEffect(() => { load(); }, []);

  const fetchDiscover = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/pages/discover");
      setDiscover(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to fetch pages from Meta");
    } finally { setLoading(false); }
  };

  const connect = async (pageId) => {
    try {
      await api.post(`/pages/connect/${pageId}`);
      toast.success("Page connected");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Connect failed");
    }
  };

  const disconnect = async (pageId) => {
    if (!window.confirm("Disconnect this page?")) return;
    await api.delete(`/pages/${pageId}`);
    await load();
  };

  const sync = async (pageId) => {
    setSyncing(pageId);
    try {
      const { data } = await api.post(`/pages/${pageId}/sync`);
      toast.success(`Synced — ${data.new_comments} new comments across ${data.posts_synced} posts`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Sync failed");
    } finally { setSyncing(null); }
  };

  const isConnected = (pid) => connected.some((c) => c.page_id === pid);

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <div className="overline text-muted-foreground">Integrations</div>
          <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>
            Pages & Instagram
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
            Live data from Meta Graph API. Connecting a Page also links its Instagram Business Account if one exists.
          </p>
        </div>
        <button
          data-testid="discover-pages-button"
          onClick={fetchDiscover}
          disabled={loading}
          className="border border-foreground px-4 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-foreground hover:text-white transition disabled:opacity-60"
        >
          <ArrowsClockwise size={14} weight="bold" />
          {loading ? "Fetching…" : "Discover from Meta"}
        </button>
      </div>

      <section className="mb-10">
        <div className="overline text-muted-foreground mb-3">Connected</div>
        {connected.length === 0 ? (
          <div data-testid="empty-connected" className="border border-dashed border-border p-10 text-center">
            <div className="text-sm text-muted-foreground">No pages connected yet. Click "Discover from Meta" above.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connected.map((p) => (
              <div key={p.page_id} data-testid={`connected-page-${p.page_id}`} className="grid-card p-5">
                <div className="flex gap-4">
                  {p.picture ? <img src={p.picture} alt="" className="w-14 h-14 border border-border" /> : <div className="w-14 h-14 bg-secondary border border-border" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FacebookLogo size={14} className="text-primary" weight="fill" />
                      <div className="font-bold truncate">{p.name}</div>
                    </div>
                    <div className="overline text-muted-foreground mt-1">{p.category} · {p.fan_count?.toLocaleString()} fans</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button
                    data-testid={`sync-page-${p.page_id}`}
                    onClick={() => sync(p.page_id)}
                    disabled={syncing === p.page_id}
                    className="flex-1 border border-primary text-primary px-3 py-2 text-xs font-semibold hover:bg-primary hover:text-white transition disabled:opacity-60"
                  >
                    {syncing === p.page_id ? "Syncing…" : "Sync now"}
                  </button>
                  <button
                    data-testid={`disconnect-page-${p.page_id}`}
                    onClick={() => disconnect(p.page_id)}
                    className="border border-border px-3 py-2 hover:bg-destructive hover:text-white hover:border-destructive transition"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {discover.length > 0 && (
        <section>
          <div className="overline text-muted-foreground mb-3">Available from your Facebook account</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {discover.map((p) => (
              <div key={p.page_id} data-testid={`discover-page-${p.page_id}`} className="grid-card p-5">
                <div className="flex gap-4">
                  {p.picture ? <img src={p.picture} alt="" className="w-14 h-14 border border-border" /> : <div className="w-14 h-14 bg-secondary border border-border" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{p.name}</div>
                    <div className="overline text-muted-foreground mt-1">{p.category} · {p.fan_count?.toLocaleString()} fans</div>
                    {p.instagram && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <InstagramLogo size={12} weight="bold" /> @{p.instagram.username}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  data-testid={`connect-page-${p.page_id}`}
                  onClick={() => connect(p.page_id)}
                  disabled={isConnected(p.page_id)}
                  className="mt-5 w-full bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-foreground hover:text-white transition disabled:opacity-50 disabled:bg-secondary disabled:text-muted-foreground flex items-center justify-center gap-2"
                >
                  {isConnected(p.page_id) ? "Connected" : <><Plus size={14} weight="bold" /> Connect</>}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
