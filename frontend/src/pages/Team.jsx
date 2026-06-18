import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { UserPlus, Copy } from "@phosphor-icons/react";
import { toast } from "sonner";

const ROLES = ["owner", "admin", "moderator", "viewer"];

export default function Team() {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [form, setForm] = useState({ email: "", role: "moderator" });

  const load = async () => {
    const m = await api.get("/team/members"); setMembers(m.data);
    try { const i = await api.get("/team/invites"); setInvites(i.data); } catch (err) { console.warn("invites unavailable", err); }
  };
  useEffect(() => { load(); }, []);

  const invite = async () => {
    if (!form.email) return;
    try {
      await api.post("/team/invite", form);
      toast.success("Invitation created");
      setForm({ email: "", role: "moderator" });
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const acceptUrl = (t) => `${window.location.origin}/accept-invite/${t}`;

  return (
    <div className="p-6 md:p-10 max-w-[1400px]">
      <div className="overline text-muted-foreground">RBAC</div>
      <h1 className="text-3xl lg:text-4xl font-black tracking-tight mt-1" style={{ fontFamily: "Chivo, sans-serif" }}>Team</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2">
          <div className="overline text-muted-foreground mb-3">Members</div>
          <div className="border border-border">
            {members.map((m) => (
              <div key={m.user_id} data-testid={`member-${m.user_id}`} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
                {m.user?.picture
                  ? <img src={m.user.picture} alt="" className="w-9 h-9 border border-border" />
                  : <div className="w-9 h-9 bg-secondary border border-border flex items-center justify-center font-bold text-xs">{m.user?.name?.[0]}</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{m.user?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{m.user?.email}</div>
                </div>
                <span className="overline border border-border px-2 py-1">{m.role}</span>
              </div>
            ))}
          </div>

          {invites.length > 0 && (
            <>
              <div className="overline text-muted-foreground mt-8 mb-3">Pending invites</div>
              <div className="border border-border">
                {invites.map((i) => (
                  <div key={i.id} data-testid={`invite-${i.id}`} className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{i.email}</div>
                      <div className="overline text-muted-foreground mt-0.5">{i.role}</div>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(acceptUrl(i.token)); toast.success("Invite link copied"); }}
                      className="border border-border px-2 py-1 text-xs flex items-center gap-1 hover:bg-foreground hover:text-white"
                    >
                      <Copy size={12} /> Copy link
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <div className="overline text-muted-foreground mb-3">Invite someone</div>
          <div className="border border-border p-5">
            <input
              data-testid="invite-email"
              placeholder="email@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-border px-3 py-2 text-sm focus:border-primary outline-none"
            />
            <select
              data-testid="invite-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="mt-3 w-full border border-border px-3 py-2 bg-white text-sm"
            >
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button
              data-testid="invite-submit"
              onClick={invite}
              className="mt-4 w-full bg-primary text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-foreground transition"
            >
              <UserPlus size={14} weight="bold" /> Create invite link
            </button>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              Share the generated link. The recipient must log in with Facebook, then click the link to join this workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
