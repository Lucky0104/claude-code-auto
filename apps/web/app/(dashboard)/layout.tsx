import { requireTenant } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  return (
    <AppShell
      email={ctx.email}
      fullName={ctx.fullName}
      role={ctx.role}
      memberships={ctx.memberships.map((m) => ({ tenantId: m.tenantId, tenantName: m.tenantName }))}
      activeTenantId={ctx.activeTenantId}
    >
      {children}
    </AppShell>
  );
}
