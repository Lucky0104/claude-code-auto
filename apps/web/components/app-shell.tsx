"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Megaphone, MessageSquare, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/comments", label: "Comments", icon: MessageSquare },
] as const;

export interface AppShellProps {
  email: string;
  fullName: string | null;
  role: string | null;
  memberships: { tenantId: string; tenantName: string }[];
  activeTenantId: string | null;
  children: React.ReactNode;
}

export function AppShell({
  email,
  fullName,
  role,
  memberships,
  activeTenantId,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function switchTenant(e: React.ChangeEvent<HTMLSelectElement>) {
    await fetch("/api/tenant/switch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: e.target.value }),
    });
    router.refresh();
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-5">
          <div className="text-lg font-black tracking-tight">CRYSTA·IVF</div>
          <div className="overline text-muted-foreground">Comment Automation</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((it) => {
            const active = pathname.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                data-testid={`nav-${it.label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-2 rounded-sm border border-transparent px-3 py-2 text-sm",
                  active
                    ? "border-border bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon size={16} />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-border p-3">
          {memberships.length > 1 && (
            <select
              aria-label="Workspace"
              data-testid="tenant-switcher"
              value={activeTenantId ?? ""}
              onChange={switchTenant}
              className="h-9 w-full border border-border bg-background px-2 text-sm"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.tenantName}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{fullName ?? email}</div>
              <div className="truncate text-xs text-muted-foreground">{role}</div>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={signOut}
            data-testid="sign-out"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
